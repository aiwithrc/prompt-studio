// Parse the model's reply into {prompt, negative} (PRD §6.6.3) and format the user message (§6.6.2).
import { KID_NEG, KID_STYLE, type OutputType, TYPE_LABELS } from "./constants";

export type Parsed = { prompt: string; negative: string };

export function parseModelOutput(raw: string): Parsed {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) candidates.push(m[0]);
  for (const c of candidates) {
    try {
      const j = JSON.parse(c) as { prompt?: unknown; negative?: unknown };
      if (typeof j.prompt === "string" && j.prompt.trim()) {
        return { prompt: j.prompt.trim(), negative: typeof j.negative === "string" ? j.negative.trim() : "" };
      }
    } catch {
      /* try next */
    }
  }
  // Unparseable: the whole reply becomes the prompt (PRD §6.6.3 step 3).
  return { prompt: trimmed, negative: "" };
}

/** Apply kid-safe rules to the output (PRD §6.6.3 step 4). */
export function applyKidSafe(type: OutputType, negative: string, kidSafe: boolean): string {
  if (!kidSafe || (type !== "video" && type !== "image")) return negative;
  if (/scary/i.test(negative)) return negative;
  return [negative, KID_NEG].filter(Boolean).join(", ");
}

export type ContextHit = { kind: "prompt" | "doc"; title: string; text: string; meta: { rating?: number; favourite?: boolean; type?: string } };

export function formatContext(hits: ContextHit[]): string {
  if (hits.length === 0) return "None.";
  return hits
    .map((h, i) => {
      if (h.kind === "prompt") {
        const r = h.meta.rating === 1 ? "WORKED" : h.meta.rating === -1 ? "DID NOT WORK" : "unrated";
        const fav = h.meta.favourite ? ", favourite" : "";
        return `[${i + 1}] PAST PROMPT (${TYPE_LABELS[h.meta.type as OutputType] ?? h.meta.type}, ${r}${fav}): ${h.text}`;
      }
      return `[${i + 1}] KNOWLEDGE NOTE (${h.title}): ${h.text}`;
    })
    .join("\n\n");
}

export type RequestForm = {
  type: OutputType;
  width?: number;
  height?: number;
  frames?: number;
  idea: string;
  refDesc: string;
  fields: Record<string, string>;
  negative: string;
  kidSafe: boolean;
};

export function formatRequest(f: RequestForm): string {
  const lines = [
    "REQUEST",
    `Output type: ${TYPE_LABELS[f.type]}${f.width && f.height ? ` · ${f.width}×${f.height}` : ""}${f.type === "video" && f.frames ? ` · ${f.frames} frames` : ""}`,
    `Idea: ${f.idea || "—"}`,
    `Reference image description: ${f.refDesc || "—"}`,
  ];
  for (const [k, v] of Object.entries(f.fields)) if (v && v.trim()) lines.push(`${k}: ${v.trim()}`);
  if ((f.type === "video" || f.type === "image") && f.negative.trim()) lines.push(`Avoid: ${f.negative.trim()}`);
  if (f.kidSafe && f.type !== "linkedin") lines.push(`Kid-safe: ${KID_STYLE}`);
  return lines.join("\n");
}
