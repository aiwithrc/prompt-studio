import { handle, ok, fail, requireUser } from "@/lib/api";
import { getProviderDef, resolveProvider } from "@/lib/providers";
import { updateProfile } from "@/lib/settings";

type Ctx = { params: Promise<{ provider: string }> };

// "Save & use" makes a configured provider active. Clicking a row never does this (AC-P1).
export const POST = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { provider } = await (ctx as unknown as Ctx).params;
  if (!getProviderDef(provider)) return fail(404, "not_found", "Unknown provider.");
  if (!(await resolveProvider(user.id, provider))) {
    return fail(400, "not_ready", "Add an API key or base URL for this provider first.");
  }
  await updateProfile(user.id, { activeProvider: provider });
  return ok({ active: provider });
});
