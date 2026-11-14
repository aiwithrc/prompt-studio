import { z } from "zod";
import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { getProfile, updateProfile } from "@/lib/settings";
import { getProviderDef } from "@/lib/providers";

export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await getProfile(user.id));
});

const Body = z.object({
  defaultMode: z.enum(["ai", "template"]).optional(),
  topK: z.number().int().min(1).max(10).optional(),
  showScores: z.boolean().optional(),
  kidSafeDefault: z.boolean().optional(),
  embeddingProvider: z.string().optional(),
  embeddingModel: z.string().max(200).optional(),
});

export const PATCH = handle(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, Body);
  if (body.embeddingProvider !== undefined) {
    const def = getProviderDef(body.embeddingProvider);
    if (!def || !def.embeddings) return fail(400, "bad_embedder", "Pick LM Studio, Ollama, OpenAI or a custom server for embeddings.");
  }
  await updateProfile(user.id, body);
  return ok(await getProfile(user.id));
});
