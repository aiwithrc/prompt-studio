// Provider catalogue (PRD §6.8.1) and per-user configuration lookup.
import { sql } from "./db";
import { decryptSecret } from "./crypto";

export type ProviderKind = "openai" | "anthropic" | "gemini" | "ollama";

export type ProviderDef = {
  id: string;
  label: string;
  kind: ProviderKind;
  defaultBase: string;
  defaultModel: string;
  /** Local providers run on your machine or tailnet; key is optional. */
  local: boolean;
  needsKey: boolean;
  keyUrl?: string;
  envKey?: string;
  envBase?: string;
  /** Embeddings: true when this provider has an embeddings endpoint we support. */
  embeddings: boolean;
  help: string;
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "openai",
    defaultBase: "http://host.docker.internal:1234/v1",
    defaultModel: "",
    local: true,
    needsKey: false,
    envBase: "LMSTUDIO_BASE_URL",
    embeddings: true,
    help: "Start LM Studio's local server and enable CORS in its server settings. Use host.docker.internal:1234 when running in Docker, localhost outside Docker, or a Tailscale IP to reach a PC from the VPS.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "ollama",
    defaultBase: "http://host.docker.internal:11434",
    defaultModel: "llama3.2",
    local: true,
    needsKey: false,
    envBase: "OLLAMA_BASE_URL",
    embeddings: true,
    help: "Run Ollama and set OLLAMA_HOST=0.0.0.0 if the app runs in another container or machine.",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    local: false,
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    envKey: "OPENAI_API_KEY",
    embeddings: true,
    help: "Used for chat and for text-embedding-3-small embeddings.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    defaultBase: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    local: false,
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    envKey: "ANTHROPIC_API_KEY",
    embeddings: false,
    help: "Chat only. Pair with LM Studio, Ollama or OpenAI for embeddings.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "gemini",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    local: false,
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    envKey: "GEMINI_API_KEY",
    embeddings: false,
    help: "Chat only.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    defaultBase: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    local: false,
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    envKey: "OPENROUTER_API_KEY",
    embeddings: false,
    help: "One key for many models.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    defaultBase: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    local: false,
    needsKey: true,
    keyUrl: "https://console.groq.com/keys",
    envKey: "GROQ_API_KEY",
    embeddings: false,
    help: "Fast hosted open models. Chat only.",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    defaultBase: "",
    defaultModel: "",
    local: true,
    needsKey: false,
    embeddings: true,
    help: "Any server with /v1/chat/completions, /v1/models and /v1/embeddings. Key is optional.",
  },
];

export function getProviderDef(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type ResolvedProvider = {
  def: ProviderDef;
  baseUrl: string;
  model: string;
  apiKey: string;
  source: "saved" | "env" | "default";
};

/**
 * Effective settings for a provider: the user's saved config first, then server env defaults.
 * Returns null when the provider has no usable config (e.g. a cloud provider without a key).
 */
export async function resolveProvider(userId: string, providerId: string): Promise<ResolvedProvider | null> {
  const def = getProviderDef(providerId);
  if (!def) return null;
  const [row] = await sql<{ base_url: string | null; model: string | null; api_key_enc: string | null }[]>`
    select base_url, model, api_key_enc from providers where user_id = ${userId} and provider = ${providerId}
  `;
  const envKey = def.envKey ? process.env[def.envKey] ?? "" : "";
  const envBase = def.envBase ? process.env[def.envBase] ?? "" : "";
  const apiKey = row?.api_key_enc ? decryptSecret(row.api_key_enc) : envKey;
  const baseUrl = row?.base_url || envBase || def.defaultBase;
  if (!baseUrl) return null;
  if (def.needsKey && !apiKey) return null;
  return {
    def,
    baseUrl,
    model: row?.model || (def.id === "lmstudio" ? "" : def.defaultModel),
    apiKey,
    source: row ? "saved" : envKey || envBase ? "env" : "default",
  };
}

/** Whether a provider is configured for this user (saved row or env). Used by the settings UI. */
export async function providerStatus(userId: string): Promise<Map<string, { saved: boolean; hint: string | null; base: string | null; model: string | null }>> {
  const rows = await sql<{ provider: string; api_key_hint: string | null; base_url: string | null; model: string | null }[]>`
    select provider, api_key_hint, base_url, model from providers where user_id = ${userId}
  `;
  const map = new Map<string, { saved: boolean; hint: string | null; base: string | null; model: string | null }>();
  for (const r of rows) map.set(r.provider, { saved: true, hint: r.api_key_hint, base: r.base_url, model: r.model });
  return map;
}
