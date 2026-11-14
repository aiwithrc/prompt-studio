// Label normalisation (PRD KB-08): trim, strip leading '#', lowercase, spaces -> '-', dedupe.

export function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Parse "Brand Voice, #LinkedIn" into ["brand-voice", "linkedin"]. */
export function parseLabels(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,\n]/);
  const out: string[] = [];
  for (const p of parts) {
    const n = normalizeLabel(p);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Split a knowledge search box into free-text words and #label tokens. */
export function splitSearch(q: string): { words: string; labels: string[] } {
  const labels: string[] = [];
  const words = q
    .replace(/#([\p{L}\p{N}_-]+)/gu, (_, tag: string) => {
      const n = normalizeLabel(tag);
      if (n && !labels.includes(n)) labels.push(n);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { words, labels };
}
