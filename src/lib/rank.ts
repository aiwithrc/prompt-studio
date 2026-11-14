// Ranking helpers (PRD §6.3, RAG-02 and RAG-03): Reciprocal Rank Fusion and multiplicative boosts.

export const RRF_K = 60;

export type Ranked = { id: string; rank: number };

/** Reciprocal Rank Fusion over several ranked lists. Returns ids sorted by fused score (desc). */
export function rrf(lists: Ranked[][], k = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

export type PromptMeta = { type: string; rating: number; favourite: boolean };

/** RAG-03 boosts for saved prompts. Passages get no boost. */
export function promptBoost(meta: PromptMeta, requestedType: string): number {
  let b = 1;
  if (meta.type === requestedType) b *= 1.3;
  if (meta.rating === 1) b *= 1.4;
  if (meta.rating === -1) b *= 0.6;
  if (meta.favourite) b *= 1.2;
  return b;
}

/** Build a 1-based rank list from ids sorted by score. */
export function toRanked(ids: string[]): Ranked[] {
  return ids.map((id, i) => ({ id, rank: i + 1 }));
}
