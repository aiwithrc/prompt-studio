import { z } from "zod";
import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { GenerateInput, retrieveFor } from "@/lib/generate";
import { getProfile } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { fail } from "@/lib/api";

// Live Retrieved Context panel (GEN-15). Same inputs as generate, without mode, and no LLM call.
const Body = GenerateInput.omit({ mode: true }).extend({ mode: z.enum(["ai", "template"]).optional() });

export const POST = handle(async (req) => {
  const user = await requireUser();
  const limit = rateLimit(`retrieve:${user.id}`, 120, 60_000); // NFR-04
  if (!limit.ok) return fail(429, "rate_limited", "Too many requests. Slow down a little.");
  const input = await parseBody(req, Body);
  const profile = await getProfile(user.id);
  const hits = await retrieveFor(user.id, { ...input, mode: "ai" }, profile.topK);
  return ok({
    hits: hits.map((h) => ({
      kind: h.kind,
      id: h.id,
      score: Number(h.score.toFixed(5)),
      title: h.title,
      snippet: h.snippet,
      meta: h.meta,
    })),
  });
});
