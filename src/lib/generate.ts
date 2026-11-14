// Generation pipeline (PRD Â§9.6). Used by /api/generate. Logs every run to `generations` (TRK-04).
import { z } from "zod";
import { sql } from "./db";
import { FRAME_OPTIONS, JSON_RULE, OUTPUT_TYPES, SIZES, type OutputType } from "./constants";
import { templateNegative, templatePrompt } from "./template";
import { retrieve, toContextHits, type Hit } from "./rag";
import { getEngine, getProfile } from "./settings";
import { resolveProvider, getProviderDef } from "./providers";
import { complete } from "./llm";
import { applyKidSafe, formatContext, formatRequest, parseModelOutput } from "./parse";

export const GenerateInput = z.object({
  type: z.enum(OUTPUT_TYPES),
  mode: z.enum(["ai", "template"]),
  sizeIndex: z.number().int().min(0).optional(),
  frames: z.union([z.literal(97), z.literal(153), z.literal(241)]).optional(),
  idea: z.string().max(4000).default(""),
  refDesc: z.string().max(2000).default(""),
  fields: z.record(z.string(), z.string().max(500)).default({}),
  negative: z.string().max(1000).default(""),
  kidSafe: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  collection: z.string().max(80).default(""),
  useLibrary: z.boolean().default(true),
  useKnowledge: z.boolean().default(true),
  labels: z.array(z.string()).default([]),
  excludedHitIds: z.array(z.string()).default([]),
  currentPromptId: z.string().uuid().optional(),
});
export type GenerateInput = z.infer<typeof GenerateInput>;

export const hasContent = (i: GenerateInput) =>
  Boolean(i.idea.trim() || i.refDesc.trim() || Object.values(i.fields).some((v) => v && v.trim()));

/** Query text: idea, reference, every detail, tags and collection (RAG-01). */
export function buildQuery(i: GenerateInput): string {
  return [i.idea, i.refDesc, ...Object.values(i.fields), i.tags.join(" "), i.collection]
    .filter((s) => s && s.trim())
    .join(" ");
}

export function sizeFor(i: GenerateInput): { width?: number; height?: number } {
  if (i.type !== "video" && i.type !== "image") return {};
  const s = SIZES[i.type][i.sizeIndex ?? 0];
  return s ? { width: s.w, height: s.h } : {};
}

/** Retrieval for a request. Excluded hits (unchecked in the UI) are dropped after ranking (RAG-08). */
export async function retrieveFor(userId: string, i: GenerateInput, topK: number): Promise<Hit[]> {
  if (!i.useLibrary && !i.useKnowledge) return [];
  const excluded = new Set(i.excludedHitIds);
  const hits = await retrieve({
    userId,
    query: buildQuery(i),
    type: i.type,
    useLibrary: i.useLibrary,
    useKnowledge: i.useKnowledge,
    labels: i.labels,
    excludePromptId: i.currentPromptId,
    topK: topK + excluded.size,
  });
  return hits.filter((h) => !excluded.has(h.id)).slice(0, topK);
}

export type GenerateResult = {
  prompt: string;
  negative: string;
  meta: {
    provider: string;
    model: string;
    sources: number;
    mode: "ai" | "template";
    width?: number;
    height?: number;
    frames?: number;
    latencyMs: number;
    label: string;
  };
  hits: { kind: string; id: string; score: number; title: string; snippet: string; meta: Hit["meta"] }[];
  fallback: boolean;
  error?: string;
};

function publicHits(hits: Hit[]) {
  return hits.map((h) => ({
    kind: h.kind,
    id: h.id,
    score: Number(h.score.toFixed(5)),
    title: h.title,
    snippet: h.snippet,
    meta: h.meta,
  }));
}

export async function generate(userId: string, i: GenerateInput): Promise<GenerateResult> {
  const started = Date.now();
  const profile = await getProfile(userId);
  const size = sizeFor(i);
  const frames = i.type === "video" ? (i.frames ?? FRAME_OPTIONS[0]) : undefined;
  const hits = await retrieveFor(userId, i, profile.topK);
  const passages = hits.filter((h) => h.kind === "doc");

  const tplPrompt = templatePrompt(
    { type: i.type as OutputType, idea: i.idea, refDesc: i.refDesc, fields: i.fields, kidSafe: i.kidSafe, frames },
    passages,
  );
  const tplNegative = templateNegative(i.type, i.negative, i.kidSafe);

  const finish = async (
    out: { prompt: string; negative: string },
    extra: { error?: string; fallback: boolean; provider: string; model: string },
  ): Promise<GenerateResult> => {
    const latencyMs = Date.now() - started;
    const mode: "ai" | "template" = extra.fallback || i.mode === "template" ? "template" : "ai";
    await sql`
      insert into generations (user_id, type, mode, provider, model, request, hit_ids, output, negative, latency_ms, error)
      values (${userId}, ${i.type}, ${mode}, ${extra.provider}, ${extra.model},
              ${sql.json(i as unknown as Record<string, never>)},
              ${sql.json(hits.map((h) => ({ kind: h.kind, id: h.id, score: h.score })))},
              ${out.prompt}, ${out.negative}, ${latencyMs}, ${extra.error ?? null})
    `;
    return {
      prompt: out.prompt,
      negative: out.negative,
      meta: {
        provider: extra.provider,
        model: extra.model,
        sources: hits.length,
        mode,
        ...size,
        frames,
        latencyMs,
        label:
          mode === "template"
            ? "TEMPLATE"
            : `${extra.provider.toUpperCase()}${extra.model ? " Â· " + extra.model : ""}`,
      },
      hits: publicHits(hits),
      fallback: extra.fallback,
      error: extra.error,
    };
  };

  if (i.mode === "template") {
    return finish({ prompt: tplPrompt, negative: tplNegative }, { fallback: false, provider: "template", model: "" });
  }

  const providerId = profile.activeProvider;
  const providerLabel = getProviderDef(providerId)?.label ?? "Provider";
  const provider = providerId && providerId !== "none" ? await resolveProvider(userId, providerId) : null;

  if (!provider) {
    return finish(
      { prompt: tplPrompt, negative: tplNegative },
      {
        error: `${providerLabel}: no usable configuration. Set it up in Settings. Used the template instead.`,
        fallback: true,
        provider: providerId,
        model: "",
      },
    );
  }

  try {
    const engine = await getEngine(userId);
    const system = `${engine.base.trim()}\n\n${engine[i.type].trim()}\n\n${JSON_RULE}`;
    const user = `${formatRequest({
      type: i.type,
      width: size.width,
      height: size.height,
      frames,
      idea: i.idea,
      refDesc: i.refDesc,
      fields: i.fields,
      negative: i.negative,
      kidSafe: i.kidSafe,
    })}\n\nRETRIEVED CONTEXT\n${formatContext(toContextHits(hits))}`;
    const r = await complete(provider, { system, user, maxTokens: 1200, json: true });
    const parsed = parseModelOutput(r.text);
    if (!parsed.prompt) throw new Error("the model returned an empty prompt");
    const negative = i.type === "video" || i.type === "image" ? applyKidSafe(i.type, parsed.negative, i.kidSafe) : "";
    return finish({ prompt: parsed.prompt, negative }, { fallback: false, provider: providerId, model: provider.model });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "request failed").slice(0, 300).replace(/\.+$/, "");
    return finish(
      { prompt: tplPrompt, negative: tplNegative },
      { error: `${providerLabel}: ${msg}. Used the template instead.`, fallback: true, provider: providerId, model: provider.model },
    );
  }
}

