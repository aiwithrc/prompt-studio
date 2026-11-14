// URL guard for provider base URLs (PRD SEC-04, adapted).
// Local providers (LM Studio, Ollama, custom) may point at private addresses, because the user runs them on
// their own machine or Tailscale network. Link-local and cloud-metadata addresses are always blocked.

const LINK_LOCAL = [/^169\.254\./, /^fe80:/i];
const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata", "instance-data"]);

export function assertSafeBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Base URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must start with http:// or https://");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (METADATA_HOSTS.has(host) || LINK_LOCAL.some((r) => r.test(host))) {
    throw new Error("That address is not allowed");
  }
  return url;
}

/** Strip a trailing slash so `${base}/models` works. */
export function normalizeBase(raw: string): string {
  return assertSafeBaseUrl(raw).toString().replace(/\/+$/, "");
}
