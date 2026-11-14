// Per-user preferences, engine sections and the embedding configuration (PRD §6.9, §8 profiles/engine_sections).
import { sql } from "./db";
import { DEFAULT_ENGINE, SECTIONS, type Section } from "./constants";
import { getProviderDef, resolveProvider, type ResolvedProvider } from "./providers";

export type Profile = {
  defaultMode: "ai" | "template";
  topK: number;
  showScores: boolean;
  kidSafeDefault: boolean;
  activeProvider: string;
  embeddingProvider: string;
  embeddingModel: string;
};

export async function ensureProfile(userId: string): Promise<void> {
  await sql`insert into profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
}

export async function getProfile(userId: string): Promise<Profile> {
  await ensureProfile(userId);
  const [r] = await sql<{
    default_mode: "ai" | "template";
    top_k: number;
    show_scores: boolean;
    kid_safe_default: boolean;
    active_provider: string;
    embedding_provider: string;
    embedding_model: string;
  }[]>`select * from profiles where user_id = ${userId}`;
  return {
    defaultMode: r.default_mode,
    topK: r.top_k,
    showScores: r.show_scores,
    kidSafeDefault: r.kid_safe_default,
    activeProvider: r.active_provider,
    embeddingProvider: r.embedding_provider,
    embeddingModel: r.embedding_model,
  };
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<void> {
  await ensureProfile(userId);
  const current = await getProfile(userId);
  const next = { ...current, ...patch };
  await sql`
    update profiles set
      default_mode = ${next.defaultMode},
      top_k = ${next.topK},
      show_scores = ${next.showScores},
      kid_safe_default = ${next.kidSafeDefault},
      active_provider = ${next.activeProvider},
      embedding_provider = ${next.embeddingProvider},
      embedding_model = ${next.embeddingModel}
    where user_id = ${userId}
  `;
}

export async function getEngine(userId: string): Promise<Record<Section, string>> {
  const rows = await sql<{ section: Section; content: string }[]>`
    select section, content from engine_sections where user_id = ${userId}
  `;
  const out = { ...DEFAULT_ENGINE } as Record<Section, string>;
  for (const r of rows) if (SECTIONS.includes(r.section)) out[r.section] = r.content;
  return out;
}

/** Which sections the user has customised (for the • marker in the UI). */
export async function customisedSections(userId: string): Promise<Set<Section>> {
  const rows = await sql<{ section: Section }[]>`select section from engine_sections where user_id = ${userId}`;
  return new Set(rows.map((r) => r.section));
}

/** The active embedder for this user, or null when none is configured. */
export async function getEmbedder(userId: string): Promise<{ provider: ResolvedProvider; model: string } | null> {
  const profile = await getProfile(userId);
  if (!profile.embeddingModel) return null;
  const def = getProviderDef(profile.embeddingProvider);
  if (!def || !def.embeddings) return null;
  const provider = await resolveProvider(userId, profile.embeddingProvider);
  if (!provider) return null;
  return { provider, model: profile.embeddingModel };
}
