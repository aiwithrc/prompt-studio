// Knowledge base: sources, chunks, ingest, label filters and search (PRD §6.5, §9.1, §9.2).
// Ingest runs inline in the request (no separate worker process), which suits a single-instance VPS.
import { sql, toVector } from "./db";
import { chunkText, MAX_TOKENS } from "./chunk";
import { embedTexts } from "./llm";
import { getEmbedder } from "./settings";
import { parseLabels, splitSearch } from "./labels";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // NFR-05
export const MAX_SOURCES_PER_USER = 200; // NFR-05
const EMBED_BATCH = 32; // PRD §9.1 (≤ 96; smaller is kinder to local servers)

export type SourceRow = {
  id: string;
  title: string;
  labels: string[];
  mime: string;
  char_count: number;
  status: "queued" | "processing" | "ready" | "failed";
  error: string | null;
  created_at: Date;
};

/** Accepts .txt and .md only in v1 (KB-02). Rejects binaries (SEC-05). */
export function readUploadText(name: string, bytes: Uint8Array): { text: string; mime: string } {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
    throw new Error(`${name}: only .txt and .md files are supported in this version`);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`${name}: file is larger than 5 MB`);
  if (bytes.includes(0)) throw new Error(`${name}: looks like a binary file`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { text, mime: lower.endsWith(".md") ? "text/markdown" : "text/plain" };
}

async function embedAndStore(userId: string, sourceId: string): Promise<void> {
  const emb = await getEmbedder(userId);
  if (!emb) return;
  for (;;) {
    const batch = await sql<{ id: string; content: string }[]>`
      select id, content from knowledge_chunks
      where source_id = ${sourceId} and user_id = ${userId} and embedding is null
      order by ordinal limit ${EMBED_BATCH}
    `;
    if (batch.length === 0) return;
    const vectors = await embedTexts(emb.provider, emb.model, batch.map((b) => b.content.slice(0, 8000)));
    if (vectors.length !== batch.length) throw new Error("Embedding server returned the wrong number of vectors");
    await sql.begin(async (tx) => {
      for (let i = 0; i < batch.length; i++) {
        await tx`update knowledge_chunks set embedding = ${toVector(vectors[i])}::vector, embedding_model = ${emb.model} where id = ${batch[i].id}`;
      }
    });
  }
}

/** Chunk, store and embed a source's text. Sets status to ready or failed. */
export async function ingestText(userId: string, sourceId: string, text: string, mime: string): Promise<void> {
  await sql`update knowledge_sources set status = 'processing', error = null where id = ${sourceId} and user_id = ${userId}`;
  try {
    const chunks = chunkText(text, { maxTokens: MAX_TOKENS, markdown: mime === "text/markdown" });
    if (chunks.length === 0) throw new Error("No readable text found in this source");
    await sql`delete from knowledge_chunks where source_id = ${sourceId} and user_id = ${userId}`;
    await sql.begin(async (tx) => {
      for (const c of chunks) {
        await tx`
          insert into knowledge_chunks (source_id, user_id, ordinal, content, token_count)
          values (${sourceId}, ${userId}, ${c.ordinal}, ${c.content}, ${c.tokenCount})
        `;
      }
    });
    await sql`update knowledge_sources set char_count = ${text.length} where id = ${sourceId}`;
    await embedAndStore(userId, sourceId);
    await sql`update knowledge_sources set status = 'ready', error = null where id = ${sourceId}`;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Ingest failed").slice(0, 300);
    await sql`update knowledge_sources set status = 'failed', error = ${msg} where id = ${sourceId}`;
  }
}

export async function createSource(userId: string, title: string, labels: string[], text: string, mime: string): Promise<SourceRow> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from knowledge_sources where user_id = ${userId}`;
  if (n >= MAX_SOURCES_PER_USER) throw new Error(`You can keep up to ${MAX_SOURCES_PER_USER} sources`);
  const [row] = await sql<SourceRow[]>`
    insert into knowledge_sources (user_id, title, labels, mime, status)
    values (${userId}, ${title.trim() || "Untitled"}, ${parseLabels(labels)}, ${mime}, 'queued')
    returning *
  `;
  await ingestText(userId, row.id, text, mime);
  const [fresh] = await sql<SourceRow[]>`select * from knowledge_sources where id = ${row.id}`;
  return fresh;
}

export async function retryEmbedding(userId: string, sourceId: string): Promise<SourceRow | null> {
  const [src] = await sql<SourceRow[]>`select * from knowledge_sources where id = ${sourceId} and user_id = ${userId}`;
  if (!src) return null;
  try {
    await sql`update knowledge_sources set status = 'processing', error = null where id = ${sourceId}`;
    await embedAndStore(userId, sourceId);
    await sql`update knowledge_sources set status = 'ready' where id = ${sourceId}`;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Retry failed").slice(0, 300);
    await sql`update knowledge_sources set status = 'failed', error = ${msg} where id = ${sourceId}`;
  }
  const [fresh] = await sql<SourceRow[]>`select * from knowledge_sources where id = ${sourceId}`;
  return fresh;
}

export async function updateSource(userId: string, id: string, patch: { title?: string; labels?: string[] }) {
  const [cur] = await sql<SourceRow[]>`select * from knowledge_sources where id = ${id} and user_id = ${userId}`;
  if (!cur) return null;
  const title = patch.title !== undefined ? patch.title.trim() || cur.title : cur.title;
  const labels = patch.labels !== undefined ? parseLabels(patch.labels) : cur.labels;
  const [row] = await sql<SourceRow[]>`
    update knowledge_sources set title = ${title}, labels = ${labels} where id = ${id} and user_id = ${userId} returning *
  `;
  return row;
}

export async function deleteSource(userId: string, id: string): Promise<boolean> {
  const r = await sql`delete from knowledge_sources where id = ${id} and user_id = ${userId}`;
  return r.count > 0;
}

/**
 * Sources filtered by labels (AND, KB-07) and an optional full-text query. With a query, each source reports how many
 * of its passages match and one highlighted snippet.
 */
export async function listSources(userId: string, rawQuery: string, extraLabels: string[] = []) {
  const { words, labels: tokenLabels } = splitSearch(rawQuery);
  const labels = [...new Set([...tokenLabels, ...parseLabels(extraLabels)])];
  const q = words || null;

  const sources = await sql<(SourceRow & { match_count: number | null; snippet: string | null })[]>`
    select s.*,
      (select count(*)::int from knowledge_chunks c
        where c.source_id = s.id and ${q}::text is not null and c.fts @@ websearch_to_tsquery('english', ${q})) as match_count,
      (select ts_headline('english', c.content, websearch_to_tsquery('english', ${q}),
          'MaxFragments=1, MaxWords=30, MinWords=12')
        from knowledge_chunks c
        where c.source_id = s.id and ${q}::text is not null and c.fts @@ websearch_to_tsquery('english', ${q})
        order by ts_rank_cd(c.fts, websearch_to_tsquery('english', ${q})) desc limit 1) as snippet
    from knowledge_sources s
    where s.user_id = ${userId}
      and (cardinality(${labels}::text[]) = 0 or s.labels @> ${labels}::text[])
      and (${q}::text is null or exists (
        select 1 from knowledge_chunks c where c.source_id = s.id and c.fts @@ websearch_to_tsquery('english', ${q})))
    order by s.created_at desc
  `;

  const counts = await sql<{ label: string; n: number }[]>`
    select l as label, count(*)::int as n
    from knowledge_sources, unnest(labels) as l
    where user_id = ${userId}
    group by l order by n desc, l
  `;
  const [total] = await sql<{ n: number }[]>`select count(*)::int as n from knowledge_sources where user_id = ${userId}`;

  return {
    sources: sources.map((s) => ({
      id: s.id,
      title: s.title,
      labels: s.labels,
      mime: s.mime,
      status: s.status,
      error: s.error,
      charCount: s.char_count,
      createdAt: s.created_at,
      matchCount: q ? s.match_count ?? 0 : undefined,
      snippet: q ? s.snippet ?? undefined : undefined,
    })),
    labels: counts.map((c) => ({ name: c.label, count: c.n })),
    totals: { sources: total.n, matching: sources.length, labelsActive: labels },
  };
}

export async function sourceChunks(userId: string, sourceId: string) {
  const [src] = await sql<SourceRow[]>`select * from knowledge_sources where id = ${sourceId} and user_id = ${userId}`;
  if (!src) return null;
  const chunks = await sql<{ ordinal: number; content: string }[]>`
    select ordinal, content from knowledge_chunks where source_id = ${sourceId} and user_id = ${userId} order by ordinal
  `;
  return { source: { id: src.id, title: src.title, labels: src.labels }, chunks };
}

export async function hasEmbedder(userId: string): Promise<boolean> {
  return (await getEmbedder(userId)) !== null;
}
