import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { generate, GenerateInput, hasContent } from "@/lib/generate";
import { rateLimit } from "@/lib/rate-limit";

export const POST = handle(async (req) => {
  const user = await requireUser();
  const limit = rateLimit(`generate:${user.id}`, 30, 60_000); // NFR-04
  if (!limit.ok) return fail(429, "rate_limited", `Slow down. Try again in ${limit.retryAfter} seconds.`);
  const input = await parseBody(req, GenerateInput);
  if (!hasContent(input)) return fail(400, "empty", "Enter an idea or some details first.");
  return ok(await generate(user.id, input));
});
