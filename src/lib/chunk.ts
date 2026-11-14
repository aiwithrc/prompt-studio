// Chunking (PRD §9.2). Paragraph-packed chunks of <= maxTokens with a sentence overlap between neighbours.
// Markdown: the nearest preceding heading is prefixed to each chunk. Token count is approximated as words * 1.3.

export type Chunk = { ordinal: number; content: string; tokenCount: number };

export const MAX_TOKENS = 500;
export const OVERLAP_TOKENS = 50;

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function hardSplit(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const perPiece = Math.max(1, Math.floor(maxTokens / 1.3));
  const out: string[] = [];
  for (let i = 0; i < words.length; i += perPiece) out.push(words.slice(i, i + perPiece).join(" "));
  return out;
}

/** Break text into units no larger than maxTokens: paragraph, then sentences, then hard word splits. */
function units(text: string, maxTokens: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (estimateTokens(p) <= maxTokens) {
      out.push(p);
      continue;
    }
    for (const sentence of splitSentences(p)) {
      if (estimateTokens(sentence) <= maxTokens) out.push(sentence);
      else out.push(...hardSplit(sentence, maxTokens));
    }
  }
  return out;
}

export function chunkText(
  input: string,
  opts: { maxTokens?: number; overlapTokens?: number; markdown?: boolean } = {},
): Chunk[] {
  const maxTokens = opts.maxTokens ?? MAX_TOKENS;
  const overlapTokens = opts.overlapTokens ?? OVERLAP_TOKENS;
  const text = normalizeText(input);
  if (!text) return [];

  const bodies: { heading: string; body: string }[] = [];
  let heading = "";

  let current: string[] = []; // units in the chunk being built (overlap carry + new content)
  let currentTokens = 0;
  let hasNew = false; // true once the current chunk contains at least one unit not carried over
  let chunkHeading = "";

  const flush = () => {
    if (!hasNew) return;
    bodies.push({ heading: chunkHeading, body: current.join("\n\n") });
    // Carry the trailing sentences into the next chunk as overlap.
    const carry: string[] = [];
    let carried = 0;
    const all = current.join(" ");
    const sentences = splitSentences(all);
    for (let j = sentences.length - 1; j >= 0 && carried < overlapTokens; j--) {
      carry.unshift(sentences[j]);
      carried += estimateTokens(sentences[j]);
    }
    current = carry.length ? [carry.join(" ")] : [];
    currentTokens = carried;
    hasNew = false;
  };

  for (const unit of units(text, maxTokens)) {
    if (opts.markdown && /^#{1,6}\s/.test(unit)) {
      heading = unit.split("\n")[0].trim();
    }
    const t = estimateTokens(unit);
    if (hasNew && currentTokens + t > maxTokens) {
      flush();
    }
    if (!hasNew) chunkHeading = heading;
    current.push(unit);
    currentTokens += t;
    hasNew = true;
  }
  flush();

  return bodies.map(({ heading: h, body }, i) => {
    const content = opts.markdown && h && !body.startsWith(h) ? `${h}\n${body}` : body;
    return { ordinal: i + 1, content, tokenCount: estimateTokens(content) };
  });
}
