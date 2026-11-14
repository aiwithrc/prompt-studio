import { z } from "zod";
import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";
import { sql } from "@/lib/db";
import { getProviderDef, resolveProvider } from "@/lib/providers";
import { listModels } from "@/lib/llm";
import { normalizeBase } from "@/lib/ssrf";

type Ctx = { params: Promise<{ provider: string }> };

const Body = z.object({
  baseUrl: z.string().max(300).optional(),
  apiKey: z.string().max(400).optional(),
});

// "Test & load models" (LLM-05). Works on an unsaved draft. Saves nothing (AC-P3).
export const POST = handle(async (req, ctx) => {
  const user = await requireUser();
  const { provider } = await (ctx as unknown as Ctx).params;
  const def = getProviderDef(provider);
  if (!def) return fail(404, "not_found", "Unknown provider.");
  const draft = await parseBody(req, Body);

  let baseUrl = draft.baseUrl?.trim() || (await resolveProvider(user.id, provider))?.baseUrl || def.defaultBase;
  let apiKey = draft.apiKey?.trim() ?? "";
  if (!apiKey) {
    const [row] = await sql<{ api_key_enc: string | null }[]>`
      select api_key_enc from providers where user_id = ${user.id} and provider = ${provider}
    `;
    apiKey = row?.api_key_enc ? decryptSecret(row.api_key_enc) : (def.envKey ? process.env[def.envKey] ?? "" : "");
  }
  if (!baseUrl) return ok({ ok: false, message: "Couldn't connect: add a base URL first." });
  if (def.needsKey && !apiKey) return ok({ ok: false, message: "Couldn't connect: add an API key first." });

  try {
    baseUrl = normalizeBase(baseUrl);
    const models = await listModels({ def, baseUrl, apiKey });
    return ok({ ok: true, models, message: `Connected. ${models.length} model${models.length === 1 ? "" : "s"} found.` });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "unknown error").slice(0, 300);
    const hint =
      def.local && !msg.startsWith("Base URL")
        ? " For LM Studio, turn on CORS and start the local server. Check the address is reachable from the server."
        : "";
    return ok({ ok: false, message: `Couldn't connect: ${msg}.${hint}`.replace(/\.\./g, ".") });
  }
});
