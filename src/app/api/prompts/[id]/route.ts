import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { deletePrompt, getPrompt, PromptPatch, serialise, updatePrompt } from "@/lib/prompts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as Ctx).params;
  const row = await getPrompt(user.id, id);
  return row ? ok(serialise(row)) : fail(404, "not_found", "Prompt not found.");
});

export const PATCH = handle(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as Ctx).params;
  const patch = await parseBody(req, PromptPatch);
  const row = await updatePrompt(user.id, id, patch);
  return row ? ok(serialise(row)) : fail(404, "not_found", "Prompt not found.");
});

export const DELETE = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as Ctx).params;
  const done = await deletePrompt(user.id, id);
  return done ? new Response(null, { status: 204 }) : fail(404, "not_found", "Prompt not found.");
});
