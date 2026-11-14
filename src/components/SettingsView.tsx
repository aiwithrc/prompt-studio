"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, Card, Eyebrow, Field, Notice, TextInput } from "@/components/ui";

type Provider = {
  id: string;
  label: string;
  kind: string;
  local: boolean;
  needsKey: boolean;
  keyUrl: string | null;
  help: string;
  embeddings: boolean;
  defaultBase: string;
  defaultModel: string;
  baseUrl: string | null;
  model: string | null;
  keyHint: string | null;
  saved: boolean;
  ready: boolean;
  source: string | null;
};

type Listing = {
  active: string;
  embedding: { provider: string; model: string };
  providers: Provider[];
};

type Profile = {
  defaultMode: "ai" | "template";
  topK: number;
  showScores: boolean;
  kidSafeDefault: boolean;
  activeProvider: string;
  embeddingProvider: string;
  embeddingModel: string;
};

function statusOf(p: Provider, active: string): { text: string; cls: string } {
  if (p.id === active) return { text: "ACTIVE", cls: "border-accent text-accent-text" };
  if (p.ready) return { text: "READY", cls: "border-cyan/40 text-cyan" };
  return { text: "SET UP", cls: "border-border text-muted" };
}

export function SettingsView() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<string>("lmstudio");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Form state for the selected provider. The API key is never loaded from the server.
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [embedProvider, setEmbedProvider] = useState("lmstudio");
  const [embedModel, setEmbedModel] = useState("");
  const [reembedding, setReembedding] = useState(false);

  async function load() {
    const [l, p] = await Promise.all([api<Listing>("/api/providers"), api<Profile>("/api/settings")]);
    setListing(l);
    setProfile(p);
    setEmbedProvider(p.embeddingProvider);
    setEmbedModel(p.embeddingModel);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof ApiError ? e.message : "Could not load settings."));
  }, []);

  const current = listing?.providers.find((p) => p.id === selected) ?? null;

  // Load the selected provider into the form (clicking a row only opens its config; AC-P1).
  useEffect(() => {
    if (!current) return;
    setBaseUrl(current.baseUrl ?? current.defaultBase);
    setModel(current.model ?? current.defaultModel);
    setApiKey("");
    setModels([]);
    setTestMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, listing?.providers.length]);

  async function test() {
    if (!current) return;
    setBusy(true);
    setTestMsg(null);
    try {
      const r = await api<{ ok: boolean; models?: string[]; message: string }>(`/api/providers/${current.id}/test`, {
        method: "POST",
        json: { baseUrl: baseUrl || undefined, apiKey: apiKey || undefined },
      });
      setTestMsg({ ok: r.ok, text: r.message });
      if (r.ok && r.models) {
        setModels(r.models);
        if (!model && r.models[0]) setModel(r.models[0]);
      }
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof ApiError ? e.message : "Test failed." });
    } finally {
      setBusy(false);
    }
  }

  async function save(activate: boolean) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/providers/${current.id}`, {
        method: "PUT",
        json: { baseUrl: baseUrl || "", model, apiKey: apiKey || undefined },
      });
      if (activate) await api(`/api/providers/${current.id}/activate`, { method: "POST" });
      setApiKey("");
      setStatus(activate ? `${current.label} is now active.` : `${current.label} saved.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    if (!current) return;
    if (!window.confirm("Remove the saved API key for this provider?")) return;
    await api(`/api/providers/${current.id}`, { method: "PUT", json: { clearKey: true } });
    setStatus("Key removed.");
    await load();
  }

  async function removeConfig() {
    if (!current) return;
    if (!window.confirm(`Remove ${current.label} from Prompt Studio? If it is active, generation falls back to templates.`)) return;
    await api(`/api/providers/${current.id}`, { method: "DELETE" });
    setStatus(`${current.label} removed.`);
    await load();
  }

  async function saveEmbedding() {
    setError("");
    try {
      await api("/api/settings", { method: "PATCH", json: { embeddingProvider: embedProvider, embeddingModel: embedModel.trim() } });
      setStatus("Embedding model saved. Run re-embed to update existing items.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the embedding model.");
    }
  }

  async function reembedAll() {
    setReembedding(true);
    setError("");
    try {
      let remaining = 1;
      let total = 0;
      while (remaining > 0) {
        const r = await api<{ done: number; remaining: number }>("/api/settings/reembed", { method: "POST" });
        total += r.done;
        remaining = r.remaining;
        setStatus(`Re-embedding… ${total} done, ${remaining} left.`);
        if (r.done === 0) break;
      }
      setStatus(`Re-embedded ${total} item${total === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Re-embedding failed.");
    } finally {
      setReembedding(false);
    }
  }

  async function savePrefs(patch: Partial<Profile>) {
    setError("");
    try {
      setProfile(await api<Profile>("/api/settings", { method: "PATCH", json: patch }));
      setStatus("Preferences saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save preferences.");
    }
  }

  if (!listing || !profile) {
    return <p className="text-muted">Loading settings…</p>;
  }

  const embedCapable = listing.providers.filter((p) => p.embeddings);

  return (
    <div className="flex flex-col gap-8">
      <Notice tone="error">{error}</Notice>
      <p role="status" aria-live="polite" className="text-[12px] text-faint">{status}</p>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3">
          <Eyebrow>LLM providers</Eyebrow>
          <ul className="flex flex-col gap-2" aria-label="Providers">
            {listing.providers.map((p) => {
              const st = statusOf(p, listing.active);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    aria-current={selected === p.id ? "true" : undefined}
                    className={`touch flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${selected === p.id ? "border-accent bg-surface" : "border-border bg-surface-deep hover:bg-surface"}`}
                  >
                    <span className="text-[14px] font-semibold text-text">{p.label}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${st.cls}`}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] text-faint">Clicking a provider opens its settings. Only "Save & use" changes the active provider.</p>
        </div>

        {current ? (
          <Card className="flex flex-col gap-5">
            <div>
              <h2 className="display text-[24px]">{current.label}</h2>
              <p className="mt-2 text-sm text-muted">{current.help}</p>
            </div>

            <Field label="Base URL" htmlFor="base-url" hint={current.local ? "Local or Tailscale address. The server calls it, so it must be reachable from the app." : "Leave as the default unless you use a proxy."}>
              <TextInput id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={current.defaultBase || "http://host:port/v1"} />
            </Field>

            {current.needsKey || current.id === "custom" ? (
              <Field label={current.needsKey ? "API key" : "API key (optional)"} htmlFor="api-key" hint={current.keyHint ? `Saved key: ${current.keyHint}. Enter a new one to replace it.` : "Stored encrypted. Never shown again."}>
                <div className="relative">
                  <TextInput id="api-key" type={showKey ? "text" : "password"} autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={current.keyHint ?? "Paste key"} />
                  <button type="button" onClick={() => setShowKey((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-[12px] font-bold text-lilac hover:bg-white/5">
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>
            ) : null}

            <Field label="Model" htmlFor="model" hint={models.length ? `${models.length} models loaded` : "Press Test & load models to pick from your server's list."}>
              <TextInput id="model" list="model-options" value={model} onChange={(e) => setModel(e.target.value)} placeholder={current.defaultModel || "model id"} />
              <datalist id="model-options">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>

            {current.keyUrl ? (
              <a href={current.keyUrl} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-bold text-lilac hover:underline">
                Get a key ↗
              </a>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={test} disabled={busy}>Test & load models</Button>
              <Button onClick={() => save(true)} disabled={busy}>Save & use</Button>
              <Button variant="ghost" onClick={() => save(false)} disabled={busy}>Save</Button>
              {current.keyHint || current.source === "env" ? (
                <Button variant="danger" onClick={removeKey} disabled={busy || current.source === "env"}>Remove key</Button>
              ) : null}
              {current.saved ? <Button variant="danger" onClick={removeConfig} disabled={busy}>Remove provider</Button> : null}
            </div>

            {testMsg ? <Notice tone={testMsg.ok ? "success" : "error"}>{testMsg.text}</Notice> : null}
            {current.source === "env" ? <p className="text-[12px] text-faint">This key comes from the server's environment settings (.env).</p> : null}
          </Card>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <Eyebrow>Embeddings</Eyebrow>
          <p className="text-[13px] text-muted">Used to find similar prompts and passages. Pick a model your server has loaded, such as an embedding model in LM Studio or nomic-embed-text in Ollama.</p>
          <Field label="Embedding provider" htmlFor="embed-provider">
            <select id="embed-provider" value={embedProvider} onChange={(e) => setEmbedProvider(e.target.value)} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text">
              {embedCapable.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Embedding model" htmlFor="embed-model" hint="Leave empty to use full-text search only.">
            <TextInput id="embed-model" value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} placeholder="nomic-embed-text or text-embedding-3-small" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveEmbedding}>Save embedding model</Button>
            <Button variant="ghost" onClick={reembedAll} disabled={reembedding || !profile.embeddingModel}>
              {reembedding ? "Re-embedding…" : "Re-embed everything"}
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <Eyebrow>Preferences</Eyebrow>
          <Field label="Default mode" htmlFor="pref-mode">
            <select id="pref-mode" value={profile.defaultMode} onChange={(e) => savePrefs({ defaultMode: e.target.value as "ai" | "template" })} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text">
              <option value="ai">AI + RAG</option>
              <option value="template">Template</option>
            </select>
          </Field>
          <Field label={`Context passages to use (top ${profile.topK})`} htmlFor="pref-topk">
            <input id="pref-topk" type="range" min={1} max={10} value={profile.topK} onChange={(e) => setProfile({ ...profile, topK: Number(e.target.value) })} onMouseUp={(e) => savePrefs({ topK: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => savePrefs({ topK: Number((e.target as HTMLInputElement).value) })} className="accent-[#ff8a4c]" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-text">
            <input type="checkbox" checked={profile.showScores} onChange={(e) => savePrefs({ showScores: e.target.checked })} className="size-4 accent-[#ff8a4c]" />
            Show relevance scores in Retrieved Context
          </label>
          <label className="flex items-center gap-3 text-sm text-text">
            <input type="checkbox" checked={profile.kidSafeDefault} onChange={(e) => savePrefs({ kidSafeDefault: e.target.checked })} className="size-4 accent-[#ff8a4c]" />
            Kid-safe mode on by default
          </label>
        </Card>
      </section>
    </div>
  );
}
