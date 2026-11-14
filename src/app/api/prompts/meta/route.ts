import { handle, ok, requireUser } from "@/lib/api";
import { collectionsAndTags } from "@/lib/prompts";

// Collections, tags and header stats (TRK-03).
export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await collectionsAndTags(user.id));
});
