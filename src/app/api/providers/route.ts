import { handle, ok, requireUser } from "@/lib/api";
import { PROVIDERS, providerStatus, resolveProvider } from "@/lib/providers";
import { getProfile } from "@/lib/settings";

// Never returns a key: only a masked hint (SEC-03, LLM-07).
export const GET = handle(async () => {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const saved = await providerStatus(user.id);
  const providers = await Promise.all(
    PROVIDERS.map(async (def) => {
      const s = saved.get(def.id);
      const resolved = await resolveProvider(user.id, def.id);
      return {
        id: def.id,
        label: def.label,
        kind: def.kind,
        local: def.local,
        needsKey: def.needsKey,
        keyUrl: def.keyUrl ?? null,
        help: def.help,
        embeddings: def.embeddings,
        defaultBase: def.defaultBase,
        defaultModel: def.defaultModel,
        baseUrl: s?.base ?? null,
        model: s?.model ?? null,
        keyHint: s?.hint ?? null,
        saved: Boolean(s),
        ready: resolved !== null,
        source: resolved?.source ?? null,
      };
    }),
  );
  return ok({ active: profile.activeProvider, embedding: { provider: profile.embeddingProvider, model: profile.embeddingModel }, providers });
});
