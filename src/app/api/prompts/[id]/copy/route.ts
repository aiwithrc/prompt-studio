import { handle, ok, fail, requireUser } from "@/lib/api";
import { copyPrompt } from "@/lib/prompts";

export const POST = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as { params: Promise<{ id: string }> }).params;
  const uses = await copyPrompt(user.id, id);
  return uses === null ? fail(404, "not_found", "Prompt not found.") : ok({ uses });
});
