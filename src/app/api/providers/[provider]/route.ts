import { z } from "zod";
import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { encryptSecret, keyHint } from "@/lib/crypto";
import { getProviderDef } from "@/lib/providers";
import { normalizeBase } from "@/lib/ssrf";
import { updateProfile, getProfile } from "@/lib/settings";

type Ctx = { params: Promise<{ provider: string }> };

const Body = z.object({
  baseUrl: z.string().max(300).optional(), // "" resets to the provider default
  model: z.string().max(200).optional(),
  apiKey: z.string().max(400).optional(), // omitted or "" keeps the stored key
  clearKey: z.boolean().optional(),
});

// Save config. Keys are encrypted at rest and never returned.
export const PUT = handle(async (req, ctx) => {
  const user = await requireUser();
  const { provider } = await (ctx as unknown as Ctx).params;
  if (!getProviderDef(provider)) return fail(404, "not_found", "Unknown provider.");
  const body = await parseBody(req, Body);

  await sql`insert into providers (user_id, provider) values (${user.id}, ${provider}) on conflict (user_id, provider) do nothing`;

  if (body.baseUrl !== undefined) {
    let base: string | null = null;
    try {
      base = body.baseUrl.trim() ? normalizeBase(body.baseUrl) : null;
    } catch (e) {
      return fail(400, "bad_url", e instanceof Error ? e.message : "Invalid base URL.");
    }
    await sql`update providers set base_url = ${base} where user_id = ${user.id} and provider = ${provider}`;
  }
  if (body.model !== undefined) {
    await sql`update providers set model = ${body.model.trim() || null} where user_id = ${user.id} and provider = ${provider}`;
  }
  let hint: string | null = null;
  if (body.clearKey) {
    await sql`update providers set api_key_enc = null, api_key_hint = null where user_id = ${user.id} and provider = ${provider}`;
  } else if (body.apiKey?.trim()) {
    const key = body.apiKey.trim();
    hint = keyHint(key);
    await sql`
      update providers set api_key_enc = ${encryptSecret(key)}, api_key_hint = ${hint}
      where user_id = ${user.id} and provider = ${provider}
    `;
  }
  await sql`update providers set updated_at = now() where user_id = ${user.id} and provider = ${provider}`;
  return ok({ ok: true, provider, hint });
});

// Remove the saved config and key. If it was active, fall back to template-only mode.
export const DELETE = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { provider } = await (ctx as unknown as Ctx).params;
  await sql`delete from providers where user_id = ${user.id} and provider = ${provider}`;
  const profile = await getProfile(user.id);
  if (profile.activeProvider === provider) await updateProfile(user.id, { activeProvider: "none" });
  return new Response(null, { status: 204 });
});
