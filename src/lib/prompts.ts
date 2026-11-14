// Prompt library repository: CRUD, filters, sort, copy counter, import/export (PRD §6.4, §6.7, LIB-06).
import { z } from "zod";
import { sql, toVector } from "./db";
import { OUTPUT_TYPES, type OutputType } from "./constants";
import { getEmbedder } from "./settings";
import { embedTexts } from "./llm";
import { parseLabels } from "./labels";

export type PromptRow = {
  id: string;
  type: OutputType;
  mode: "ai" | "template";
  prompt: string;
  negative: string;
  width: number | null;
  height: number | null;
  frames: number | null;
  idea: string;
  ref_desc: string;
  fields: Record<string, string>;
  neg_input: string;
  collection: string;
  tags: string[];
  favourite: boolean;
  rating: number;
  uses: number;
  last_used_at: Date | null;
  provider: string | null;
  model: string | null;
  created_at: Date;
  updated_at: Date;
};

export const PromptInput = z.object({
  type: z.enum(OUTPUT_TYPES),
  mode: z.enum(["ai", "template"]).default("template"),
  prompt: z.string().min(1, "Prompt text is empty.").max(20000),
  negative: z.string().max(2000).default(""),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  frames: z.number().int().nullable().optional(),
  idea: z.string().max(4000).default(""),
  refDesc: z.string().max(2000).default(""),
  fields: z.record(z.string(), z.string().max(500)).default({}),
  kidSafe: z.boolean().default(true),
  negInput: z.string().max(1000).default(""),
  collection: z.string().max(80).default(""),
  tags: z.union([z.array(z.string()), z.string()]).default([]),
  favourite: z.boolean().default(false),
  rating: z.number().int().min(-1).max(1).default(0),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
});
export type PromptInput = z.infer<typeof PromptInput>;

export const PromptPatch = z.object({
  prompt: z.string().min(1).max(20000).optional(),
  negative: z.string().max(2000).optional(),
  idea: z.string().max(4000).optional(),
  collection: z.string().max(80).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  favourite: z.boolean().optional(),
  rating: z.number().int().min(-1).max(1).optional(),
});

export function serialise(r: PromptRow) {
  return {
    id: r.id,
    type: r.type,
    mode: r.mode,
    prompt: r.prompt,
    negative: r.negative,
    width: r.width,
    height: r.height,
    frames: r.frames,
    idea: r.idea,
    refDesc: r.ref_desc,
    fields: r.fields,
    negInput: r.neg_input,
    collection: r.collection,
    tags: r.tags,
    favourite: r.favourite,
    rating: r.rating,
    uses: r.uses,
    lastUsedAt: r.last_used_at,
    provider: r.provider,
    model: r.model,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function cleanTags(t: string[] | string | undefined): string[] {
  return parseLabels(t ?? []);
}

/** Text embedded for a prompt record (PRD §9.3). */
export function embeddingText(p: { type: string; idea: string; prompt: string; tags: string[]; collection: string }): string {
  return `${p.type}: ${p.idea}\n${p.prompt}\ntags: ${p.tags.join(", ")}\ncollection: ${p.collection}`;
}

/** Best-effort embedding of one prompt record. Save never fails because of embeddings. */
export async function embedPrompt(userId: string, id: string, text: string): Promise<void> {
  const emb = await getEmbedder(userId);
  if (!emb) return;
  try {
    const [v] = await embedTexts(emb.provider, emb.model, [text.slice(0, 8000)]);
    if (v) await sql`update prompts set embedding = ${toVector(v)}::vector, embedding_model = ${emb.model} where id = ${id}`;
  } catch (e) {
    console.warn(`[prompts] embed failed: ${(e instanceof Error ? e.message : "").slice(0, 200)}`);
  }
}

/** Details plus kidSafe, stored together in `fields` (PRD §8). */
const storedFields = (input: { fields: Record<string, string>; kidSafe: boolean }) => ({ ...input.fields, kidSafe: input.kidSafe });

export async function createPrompt(userId: string, input: PromptInput): Promise<PromptRow> {
  const tags = cleanTags(input.tags);
  const [row] = await sql<PromptRow[]>`
    insert into prompts (
      user_id, type, mode, prompt, negative, width, height, frames, idea, ref_desc, fields, neg_input,
      collection, tags, favourite, rating, provider, model
    ) values (
      ${userId}, ${input.type}, ${input.mode}, ${input.prompt}, ${input.negative}, ${input.width ?? null},
      ${input.height ?? null}, ${input.frames ?? null}, ${input.idea}, ${input.refDesc},
      ${sql.json(storedFields(input))}, ${input.negInput}, ${input.collection.trim()}, ${tags}, ${input.favourite},
      ${input.rating}, ${input.provider ?? null}, ${input.model ?? null}
    ) returning *
  `;
  await embedPrompt(userId, row.id, embeddingText({ type: row.type, idea: row.idea, prompt: row.prompt, tags, collection: row.collection }));
  return row;
}

export async function getPrompt(userId: string, id: string): Promise<PromptRow | null> {
  const [row] = await sql<PromptRow[]>`select * from prompts where id = ${id} and user_id = ${userId}`;
  return row ?? null;
}

export async function updatePrompt(userId: string, id: string, patch: z.infer<typeof PromptPatch>): Promise<PromptRow | null> {
  const current = await getPrompt(userId, id);
  if (!current) return null;
  const tags = patch.tags !== undefined ? cleanTags(patch.tags) : current.tags;
  const next = {
    prompt: patch.prompt ?? current.prompt,
    negative: patch.negative ?? current.negative,
    idea: patch.idea ?? current.idea,
    collection: patch.collection !== undefined ? patch.collection.trim() : current.collection,
    tags,
    favourite: patch.favourite ?? current.favourite,
    rating: patch.rating ?? current.rating,
  };
  const [row] = await sql<PromptRow[]>`
    update prompts set
      prompt = ${next.prompt}, negative = ${next.negative}, idea = ${next.idea}, collection = ${next.collection},
      tags = ${next.tags}, favourite = ${next.favourite}, rating = ${next.rating}, updated_at = now()
    where id = ${id} and user_id = ${userId}
    returning *
  `;
  const textChanged = next.prompt !== current.prompt || next.idea !== current.idea || next.tags.join() !== current.tags.join() || next.collection !== current.collection;
  if (textChanged) {
    await embedPrompt(userId, id, embeddingText({ type: row.type, idea: row.idea, prompt: row.prompt, tags, collection: row.collection }));
  }
  return row;
}

export async function deletePrompt(userId: string, id: string): Promise<boolean> {
  const r = await sql`delete from prompts where id = ${id} and user_id = ${userId}`;
  return r.count > 0;
}

export async function copyPrompt(userId: string, id: string): Promise<number | null> {
  const [r] = await sql<{ uses: number }[]>`
    update prompts set uses = uses + 1, last_used_at = now() where id = ${id} and user_id = ${userId} returning uses
  `;
  return r?.uses ?? null;
}

export type ListQuery = {
  type?: string;
  rating?: string; // any | worked | didnt | unrated
  fav?: boolean;
  collection?: string;
  tag?: string;
  q?: string;
  sort?: string; // recent | used | worked
  offset?: number;
  limit?: number;
};

export async function listPrompts(userId: string, qy: ListQuery) {
  const limit = Math.min(qy.limit ?? 30, 100);
  const offset = qy.offset ?? 0;
  const type = qy.type && qy.type !== "all" ? qy.type : null;
  const ratingWhere =
    qy.rating === "worked" ? 1 : qy.rating === "didnt" ? -1 : qy.rating === "unrated" ? 0 : null;
  const fav = qy.fav ? true : null;
  const collection = qy.collection ? qy.collection : null;
  const tag = qy.tag ? parseLabels(qy.tag)[0] ?? null : null;
  const q = qy.q?.trim() ? qy.q.trim() : null;
  const orderBy =
    qy.sort === "used"
      ? sql`uses desc, created_at desc`
      : qy.sort === "worked"
        ? sql`rating desc, created_at desc`
        : sql`created_at desc`;

  const rows = await sql<PromptRow[]>`
    select * from prompts
    where user_id = ${userId}
      and (${type}::text is null or type = ${type})
      and (${ratingWhere}::int is null or rating = ${ratingWhere})
      and (${fav}::boolean is null or favourite = ${fav})
      and (${collection}::text is null or collection = ${collection})
      and (${tag}::text is null or ${tag} = any(tags))
      and (${q}::text is null or to_tsvector('english', coalesce(prompt,'') || ' ' || coalesce(idea,'') || ' ' || array_to_string(tags, ' ') || ' ' || coalesce(collection,''))
           @@ websearch_to_tsquery('english', ${q}))
    order by ${orderBy}
    limit ${limit + 1} offset ${offset}
  `;
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit), nextCursor: hasMore ? String(offset + limit) : null };
}

export async function collectionsAndTags(userId: string) {
  const cols = await sql<{ collection: string; n: number }[]>`
    select collection, count(*)::int as n from prompts where user_id = ${userId} and collection <> '' group by collection order by collection
  `;
  const tags = await sql<{ tag: string; n: number }[]>`
    select t as tag, count(*)::int as n from prompts, unnest(tags) as t where user_id = ${userId} group by t order by n desc, t limit 50
  `;
  const [stats] = await sql<{ total: number; worked: number; rated: number }[]>`
    select count(*)::int as total,
           count(*) filter (where rating = 1)::int as worked,
           count(*) filter (where rating <> 0)::int as rated
    from prompts where user_id = ${userId}
  `;
  return { collections: cols, tags, stats };
}

/** Legacy prototype export (localStorage `prompt-generator-history-v1`) and the new export share these fields. */
export const ImportItem = z
  .object({
    id: z.string().optional(),
    type: z.enum(OUTPUT_TYPES).optional(),
    mode: z.enum(["ai", "template"]).optional(),
    prompt: z.string().optional(),
    output: z.string().optional(),
    negative: z.string().optional(),
    negativeOut: z.string().optional(),
    idea: z.string().optional(),
    refDesc: z.string().optional(),
    fields: z.record(z.string(), z.string()).optional(),
    details: z.record(z.string(), z.string()).optional(),
    collection: z.string().optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    favourite: z.boolean().optional(),
    fav: z.boolean().optional(),
    rating: z.number().optional(),
    uses: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    frames: z.number().optional(),
    createdAt: z.string().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

/** Map a legacy or current export item to the insert shape. Returns null if there is no prompt text. */
export function normaliseImport(raw: z.infer<typeof ImportItem>): (PromptInput & { id?: string; createdAt?: Date; uses?: number }) | null {
  const text = (raw.prompt ?? raw.output ?? "").trim();
  if (!text) return null;
  const type = raw.type ?? "text";
  const rating = Math.max(-1, Math.min(1, Math.round(raw.rating ?? 0)));
  const created = raw.createdAt ?? raw.created_at;
  const createdDate = created && !Number.isNaN(Date.parse(created)) ? new Date(created) : undefined;
  return {
    id: raw.id,
    type,
    mode: raw.mode ?? "template",
    prompt: text,
    negative: raw.negative ?? raw.negativeOut ?? "",
    width: raw.width ?? null,
    height: raw.height ?? null,
    frames: raw.frames ?? null,
    idea: raw.idea ?? "",
    refDesc: raw.refDesc ?? "",
    fields: raw.fields ?? raw.details ?? {},
    negInput: "",
    collection: raw.collection ?? "",
    tags: raw.tags ?? [],
    favourite: raw.favourite ?? raw.fav ?? false,
    rating,
    provider: null,
    model: null,
    createdAt: createdDate,
  } as PromptInput & { id?: string; createdAt?: Date };
}

export async function importPrompts(userId: string, items: unknown[]) {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = ImportItem.safeParse(items[i]);
    if (!parsed.success) {
      errors.push(`#${i + 1}: not a prompt record`);
      continue;
    }
    const norm = normaliseImport(parsed.data);
    if (!norm) {
      errors.push(`#${i + 1}: no prompt text`);
      continue;
    }
    const valid = PromptInput.safeParse(norm);
    if (!valid.success) {
      errors.push(`#${i + 1}: ${valid.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    // Duplicate check by id (current export) or by exact prompt text (legacy records have no id).
    const dup = norm.id
      ? await sql`select 1 from prompts where user_id = ${userId} and (id::text = ${norm.id} or (prompt = ${norm.prompt} and created_at = ${norm.createdAt ?? new Date(0)}))`
      : await sql`select 1 from prompts where user_id = ${userId} and prompt = ${norm.prompt} and created_at = ${norm.createdAt ?? new Date(0)}`;
    if (dup.length) {
      skipped++;
      continue;
    }
    await sql`
      insert into prompts (
        user_id, type, mode, prompt, negative, width, height, frames, idea, ref_desc, fields, neg_input,
        collection, tags, favourite, rating, uses, created_at
      ) values (
        ${userId}, ${valid.data.type}, ${valid.data.mode}, ${valid.data.prompt}, ${valid.data.negative},
        ${valid.data.width ?? null}, ${valid.data.height ?? null}, ${valid.data.frames ?? null},
        ${valid.data.idea}, ${valid.data.refDesc}, ${sql.json(valid.data.fields)}, ${valid.data.negInput},
        ${valid.data.collection}, ${cleanTags(valid.data.tags)}, ${valid.data.favourite}, ${valid.data.rating},
        ${Math.max(0, Math.floor(norm.uses ?? 0))}, ${norm.createdAt ?? new Date()}
      )
    `;
    imported++;
  }
  return { imported, skipped, errors: errors.slice(0, 50) };
}

export async function exportPrompts(userId: string) {
  const rows = await sql<PromptRow[]>`select * from prompts where user_id = ${userId} order by created_at`;
  return { version: 1, exportedAt: new Date().toISOString(), prompts: rows.map(serialise) };
}
