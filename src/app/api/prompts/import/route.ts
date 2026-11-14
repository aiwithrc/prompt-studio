import { handle, ok, HttpError, requireUser } from "@/lib/api";
import { importPrompts } from "@/lib/prompts";

const MAX_ITEMS = 5000;

// Accepts the current export ({version, prompts: [...]}), a bare array, or the legacy prototype array.
export const POST = handle(async (req) => {
  const user = await requireUser();
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "Import file is not valid JSON.");
  }
  const items = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { prompts?: unknown }).prompts)
      ? (json as { prompts: unknown[] }).prompts
      : null;
  if (!items) throw new HttpError(400, "shape", "Expected a JSON array or an object with a prompts array.");
  if (items.length > MAX_ITEMS) throw new HttpError(400, "too_many", `Import up to ${MAX_ITEMS} items at a time.`);
  return ok(await importPrompts(user.id, items));
});
