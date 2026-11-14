import { handle, ok, parseBody, requireUser, HttpError } from "@/lib/api";
import { createPrompt, listPrompts, PromptInput, serialise } from "@/lib/prompts";

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const offset = Number(u.searchParams.get("cursor") ?? 0);
  const { items, nextCursor } = await listPrompts(user.id, {
    type: u.searchParams.get("type") ?? undefined,
    rating: u.searchParams.get("rating") ?? undefined,
    fav: u.searchParams.get("fav") === "1",
    collection: u.searchParams.get("collection") ?? undefined,
    tag: u.searchParams.get("tag") ?? undefined,
    q: u.searchParams.get("q") ?? undefined,
    sort: u.searchParams.get("sort") ?? undefined,
    offset: Number.isFinite(offset) ? offset : 0,
    limit: 30,
  });
  return ok({ items: items.map(serialise), nextCursor });
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, PromptInput);
  if (!input.prompt.trim()) throw new HttpError(400, "empty", "Prompt text is empty.");
  const row = await createPrompt(user.id, input);
  return ok(serialise(row), 201);
});
