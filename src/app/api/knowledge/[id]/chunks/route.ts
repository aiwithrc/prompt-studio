import { handle, ok, fail, requireUser } from "@/lib/api";
import { sourceChunks } from "@/lib/knowledge";

export const GET = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as { params: Promise<{ id: string }> }).params;
  const data = await sourceChunks(user.id, id);
  return data ? ok(data) : fail(404, "not_found", "Source not found.");
});
