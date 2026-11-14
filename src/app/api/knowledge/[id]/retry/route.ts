import { handle, ok, fail, requireUser } from "@/lib/api";
import { retryEmbedding } from "@/lib/knowledge";

export const POST = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as { params: Promise<{ id: string }> }).params;
  const row = await retryEmbedding(user.id, id);
  return row ? ok(row) : fail(404, "not_found", "Source not found.");
});
