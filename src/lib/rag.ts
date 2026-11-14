// Hybrid retrieval (PRD §6.3, §9.5): vector + full-text over saved prompts and knowledge chunks, fused with RRF,
// then boosted for prompts. Degrades gracefully to full-text only when no embedder is configured.
import { sql, toVector } from "./db";
import { embedTexts } from "./llm";
import { getEmbedder } from "./settings";
import { promptBoost, rrf, toRanked, type Ranked } from "./rank";
import type { OutputType } from "./constants";
import type { ContextHit } from "./parse";

export const MIN_SIMILARITY = 0.25; // RAG-10
const CANDIDATES = 20; // RAG-02: top 20 per list

export type Hit = {
  kind: "prompt" | "doc";
  id: string;
  score: number;
  title: string;
  snippet: string;
  text: string;
  meta: { type?: OutputType; rating?: number; favourite?: boolean; labels?: string[]; sourceId?: string; ordinal?: number };
};

export type RetrieveParams = {
  userId: string;
  query: string;
  type: OutputType;
  useLibrary: boolean;
  useKnowledge: boolean;
  labels: string[];
  excludePromptId?: string;
  topK: number;
  /** Pre-computed query vector (optional). Otherwise the user's embedder is used when configured. */
  queryEmbedding?: number[];
};

const snip = (s: string, n = 220) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Embed a single query. Returns null (not an error) when no embedder is configured or the call fails. */
export async function embedQuery(userId: string, text: string): Promise<number[] | null> {
  const emb = await getEmbedder(userId);
  if (!emb || !text.trim()) return null;
  try {
    const [v] = await embedTexts(emb.provider, emb.model, [text.slice(0, 8000)]);
    return v ?? null;
  } catch (e) {
    console.warn(`[rag] query embedding failed: ${(e instanceof Error ? e.message : "").slice(0, 200)}`);
    return null;
  }
}

export async function retrieve(p: RetrieveParams): Promise<Hit[]> {
  const query = p.query.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!query && p.labels.length === 0) return [];
  const emb = await getEmbedder(p.userId);
  const qv = p.queryEmbedding ?? (emb && query ? await embedQuery(p.userId, query) : null);
  const model = emb?.model ?? "";
  const vec = qv && model ? toVector(qv) : null;

  const hits: Hit[] = [];

  if (p.useLibrary && query) {
    const vecIds: Ranked[] = vec
      ? toRanked(
          (
            await sql<{ id: string }[]>`
              select id from prompts
              where user_id = ${p.userId}
                and embedding_model = ${model}
                and (${p.excludePromptId ?? null}::uuid is null or id <> ${p.excludePromptId ?? null}::uuid)
                and 1 - (embedding <=> ${vec}::vector) >= ${MIN_SIMILARITY}
              order by embedding <=> ${vec}::vector
              limit ${CANDIDATES}
            `
          ).map((r) => r.id),
        )
      : [];
    const ftsIds: Ranked[] = toRanked(
      (
        await sql<{ id: string }[]>`
          select id from prompts
          where user_id = ${p.userId}
            and (${p.excludePromptId ?? null}::uuid is null or id <> ${p.excludePromptId ?? null}::uuid)
            and to_tsvector('english', coalesce(prompt,'') || ' ' || coalesce(idea,'') || ' ' || coalesce(collection,''))
                @@ websearch_to_tsquery('english', ${query})
          order by ts_rank_cd(
            to_tsvector('english', coalesce(prompt,'') || ' ' || coalesce(idea,'') || ' ' || coalesce(collection,'')),
            websearch_to_tsquery('english', ${query})
          ) desc
          limit ${CANDIDATES}
        `
      ).map((r) => r.id),
    );
    const fused = rrf([vecIds, ftsIds]);
    const ids = [...fused.keys()];
    if (ids.length) {
      const rows = await sql<
        { id: string; prompt: string; idea: string; type: OutputType; rating: number; favourite: boolean; collection: string; tags: string[] }[]
      >`select id, prompt, idea, type, rating, favourite, collection, tags from prompts where id in ${sql(ids)}`;
      for (const r of rows) {
        const base = fused.get(r.id) ?? 0;
        const boost = promptBoost({ type: r.type, rating: r.rating, favourite: r.favourite }, p.type);
        hits.push({
          kind: "prompt",
          id: r.id,
          score: base * boost,
          title: `${r.collection || r.type} · ${r.idea || "untitled"}`,
          snippet: snip(r.prompt),
          text: r.prompt,
          meta: { type: r.type, rating: r.rating, favourite: r.favourite },
        });
      }
    }
  }

  if (p.useKnowledge && (query || p.labels.length)) {
    const labelFilter = p.labels;
    const vecIds: Ranked[] = vec
      ? toRanked(
          (
            await sql<{ id: string }[]>`
              select c.id from knowledge_chunks c
              join knowledge_sources s on s.id = c.source_id
              where c.user_id = ${p.userId}
                and c.embedding_model = ${model}
                and (cardinality(${labelFilter}::text[]) = 0 or s.labels && ${labelFilter}::text[])
                and 1 - (c.embedding <=> ${vec}::vector) >= ${MIN_SIMILARITY}
              order by c.embedding <=> ${vec}::vector
              limit ${CANDIDATES}
            `
          ).map((r) => r.id),
        )
      : [];
    const ftsIds: Ranked[] = query
      ? toRanked(
          (
            await sql<{ id: string }[]>`
              select c.id from knowledge_chunks c
              join knowledge_sources s on s.id = c.source_id
              where c.user_id = ${p.userId}
                and c.fts @@ websearch_to_tsquery('english', ${query})
                and (cardinality(${labelFilter}::text[]) = 0 or s.labels && ${labelFilter}::text[])
              order by ts_rank_cd(c.fts, websearch_to_tsquery('english', ${query})) desc
              limit ${CANDIDATES}
            `
          ).map((r) => r.id),
        )
      : [];
    const fused = rrf([vecIds, ftsIds]);
    const ids = [...fused.keys()];
    if (ids.length) {
      const rows = await sql<
        { id: string; content: string; ordinal: number; source_id: string; title: string; labels: string[] }[]
      >`
        select c.id, c.content, c.ordinal, c.source_id, s.title, s.labels
        from knowledge_chunks c join knowledge_sources s on s.id = c.source_id
        where c.id in ${sql(ids)}
      `;
      for (const r of rows) {
        const tags = r.labels.map((l) => `#${l}`).join(" ");
        hits.push({
          kind: "doc",
          id: r.id,
          score: fused.get(r.id) ?? 0,
          title: `${r.title}${tags ? ` · ${tags}` : ""} · ¶${r.ordinal}`,
          snippet: snip(r.content),
          text: r.content,
          meta: { labels: r.labels, sourceId: r.source_id, ordinal: r.ordinal },
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, p.topK);
}

export function toContextHits(hits: Hit[]): ContextHit[] {
  return hits.map((h) => ({
    kind: h.kind,
    title: h.title,
    text: h.text,
    meta: { rating: h.meta.rating, favourite: h.meta.favourite, type: h.meta.type },
  }));
}
