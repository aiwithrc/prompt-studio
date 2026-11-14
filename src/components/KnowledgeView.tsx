"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { parseLabels, splitSearch } from "@/lib/labels";
import { Button, Card, Chip, Eyebrow, Field, Notice, TextArea, TextInput } from "@/components/ui";

type Source = {
  id: string;
  title: string;
  labels: string[];
  status: "queued" | "processing" | "ready" | "failed";
  error: string | null;
  charCount: number;
  matchCount?: number;
  snippet?: string;
};

type Label = { name: string; count: number };

const STATUS_CLS: Record<Source["status"], string> = {
  queued: "text-muted border-border",
  processing: "text-lilac border-lilac/40",
  ready: "text-cyan border-cyan/40",
  failed: "text-danger border-danger-border",
};

export function KnowledgeView({ initial }: { initial: { sources: Source[]; labels: Label[] } }) {
  const [sources, setSources] = useState<Source[]>(initial.sources);
  const [labels, setLabels] = useState<Label[]>(initial.labels);
  const [query, setQuery] = useState("");
  const [activeLabels, setActiveLabels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [openChunks, setOpenChunks] = useState<{ id: string; title: string; chunks: { ordinal: number; content: string }[] } | null>(null);

  // Add-source form state
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [newLabels, setNewLabels] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // Debounced search with #label tokens (KB-07). Labels from chips are combined with tokens in the box.
  useEffect(() => {
    const t = setTimeout(() => {
      refresh().catch(() => {});
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeLabels.join("|")]);

  // Poll while any source is queued or processing so status moves to ready/failed.
  const pending = sources.some((s) => s.status === "queued" || s.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  async function refresh() {
    const { words, labels: tokenLabels } = splitSearch(query);
    const all = [...new Set([...activeLabels, ...tokenLabels])];
    const qs = new URLSearchParams();
    if (words) qs.set("q", words);
    if (all.length) qs.set("labels", all.join(","));
    const r = await api<{ sources: Source[]; labels: Label[] }>(`/api/knowledge?${qs.toString()}`);
    setSources(r.sources);
    setLabels(r.labels);
  }

  function toggleLabel(name: string) {
    setActiveLabels((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
  }

  async function addSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!text.trim() && files.length === 0) {
      setError("Paste some text or choose a .txt or .md file.");
      return;
    }
    setBusy(true);
    setStatus("Adding and indexing…");
    try {
      const form = new FormData();
      if (title.trim()) form.set("title", title.trim());
      if (text.trim()) form.set("text", text);
      form.set("labels", newLabels);
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/knowledge", { method: "POST", body: form, credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Upload failed.");
      setTitle("");
      setText("");
      setFiles([]);
      setNewLabels("");
      setStatus(`Added ${data.sources.length} source${data.sources.length === 1 ? "" : "s"}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the source.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function saveLabels(s: Source, value: string) {
    const parsed = parseLabels(value);
    await api(`/api/knowledge/${s.id}`, { method: "PATCH", json: { labels: parsed } }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not save labels."));
    await refresh();
  }

  async function remove(s: Source) {
    if (!window.confirm(`Delete "${s.title}" and all its passages? This cannot be undone.`)) return;
    await api(`/api/knowledge/${s.id}`, { method: "DELETE" });
    setStatus("Source deleted.");
    await refresh();
  }

  async function retry(s: Source) {
    setStatus("Retrying…");
    await api(`/api/knowledge/${s.id}/retry`, { method: "POST" }).catch((e) => setError(e instanceof ApiError ? e.message : "Retry failed."));
    await refresh();
  }

  async function viewChunks(s: Source) {
    const r = await api<{ source: { id: string; title: string }; chunks: { ordinal: number; content: string }[] }>(`/api/knowledge/${s.id}/chunks`);
    setOpenChunks({ id: s.id, title: r.source.title, chunks: r.chunks });
  }

  const labelNames = labels.map((l) => l.name);
  const matching = sources.length;
  const hasQuery = Boolean(splitSearch(query).words || activeLabels.length || splitSearch(query).labels.length);

  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="flex flex-col gap-4">
        <Eyebrow>Add a source</Eyebrow>
        <Card>
          <form onSubmit={addSource} className="flex flex-col gap-4" noValidate>
            <Field label="Title" htmlFor="ks-title">
              <TextInput id="ks-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Brand voice guide" />
            </Field>
            <Field label="Text" htmlFor="ks-text" hint="Paste notes, or upload below. Markdown headings are kept for context.">
              <TextArea id="ks-text" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste text here" />
            </Field>
            <Field label="Or upload .txt / .md files" htmlFor="ks-files" hint="Up to 5 MB each. Labels below apply to all uploaded files.">
              <input
                id="ks-files"
                type="file"
                multiple
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-btn-secondary file:px-4 file:py-2 file:font-bold file:text-white"
              />
            </Field>
            <Field label="Labels" htmlFor="ks-labels" hint="Comma separated. Spaces become dashes; # is optional.">
              <TextInput id="ks-labels" value={newLabels} onChange={(e) => setNewLabels(e.target.value)} placeholder="brand, linkedin" />
            </Field>
            {labelNames.length ? (
              <div className="flex flex-wrap gap-2" aria-label="Add existing label">
                <span className="text-[12px] text-faint">Add existing:</span>
                {labelNames.map((n) => (
                  <button key={n} type="button" onClick={() => setNewLabels((v) => parseLabels([...parseLabels(v), n]).join(", "))} className="touch rounded-full border border-border px-3 text-[12px] font-bold text-lilac hover:bg-white/5">
                    + {n}
                  </button>
                ))}
              </div>
            ) : null}
            <Button type="submit" disabled={busy}>{busy ? "Indexing…" : "Add source"}</Button>
          </form>
        </Card>
        <Notice tone="error">{error}</Notice>
        <p role="status" aria-live="polite" className="text-[12px] text-faint">{status}</p>
      </section>

      <section className="flex flex-col gap-4">
        <Eyebrow>Your sources</Eyebrow>
        <div>
          <label htmlFor="ks-search" className="mb-1.5 block text-[12px] font-semibold text-muted">Search</label>
          <TextInput id="ks-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="words, and #label tokens (e.g. tone #brand)" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by label">
          <Chip active={activeLabels.length === 0} onClick={() => setActiveLabels([])}>All</Chip>
          {labels.map((l) => (
            <Chip key={l.name} active={activeLabels.includes(l.name)} onClick={() => toggleLabel(l.name)}>
              #{l.name} <span className="ml-1 opacity-70">{l.count}</span>
            </Chip>
          ))}
        </div>
        <p className="text-[12px] text-faint">
          {hasQuery ? `${matching} of ${initial.sources.length || matching} sources` : `${matching} sources`}
          {activeLabels.length ? ` · labelled ${activeLabels.map((l) => `#${l}`).join(" + ")}` : ""}
        </p>

        {sources.length === 0 ? (
          <Card><p className="text-sm text-muted">No sources yet. Add notes on the left and they appear here.</p></Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-text">{s.title}</p>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_CLS[s.status]}`}>{s.status}</span>
                </div>
                {s.error ? <Notice tone="error">{s.error}</Notice> : null}
                {s.snippet ? <p className="text-[13px] text-muted" dangerouslySetInnerHTML={{ __html: sanitiseSnippet(s.snippet) }} /> : null}
                {typeof s.matchCount === "number" ? <p className="text-[12px] text-faint">{s.matchCount} matching passage{s.matchCount === 1 ? "" : "s"}</p> : null}
                <p className="text-[12px] text-faint">{s.charCount.toLocaleString()} characters</p>
                <LabelEditor source={s} onSave={(v) => saveLabels(s, v)} onLabelClick={toggleLabel} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => viewChunks(s)}>View passages</Button>
                  {s.status === "failed" ? <Button variant="secondary" onClick={() => retry(s)}>Retry</Button> : null}
                  <Button variant="danger" onClick={() => remove(s)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {openChunks ? (
          <div role="dialog" aria-modal="true" aria-label={`Passages of ${openChunks.title}`} className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(8,4,20,0.6)] p-4" onClick={() => setOpenChunks(null)}>
            <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <p className="display text-lg">{openChunks.title}</p>
                <Button variant="ghost" onClick={() => setOpenChunks(null)}>Close</Button>
              </div>
              <ol className="flex flex-col gap-3">
                {openChunks.chunks.map((c) => (
                  <li key={c.ordinal} className="rounded-xl border border-border bg-surface-deep p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-bold text-lilac">¶{c.ordinal}</span>
                      <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(c.content)}>Copy</Button>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] text-text">{c.content}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Inline label editor: Enter saves, Esc cancels (KB-06). */
function LabelEditor({ source, onSave, onLabelClick }: { source: Source; onSave: (v: string) => void; onLabelClick: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(source.labels.join(", "));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {source.labels.map((l) => (
        <button key={l} type="button" onClick={() => onLabelClick(l)} className="touch rounded-full px-1 text-[12px] font-semibold text-lilac hover:underline">
          #{l}
        </button>
      ))}
      {editing ? (
        <input
          autoFocus
          aria-label="Edit labels"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setEditing(false);
              onSave(value);
            }
            if (e.key === "Escape") {
              setValue(source.labels.join(", "));
              setEditing(false);
            }
          }}
          onBlur={() => setEditing(false)}
          className="touch rounded-full border border-border bg-surface-deep px-3 text-[13px] text-text focus:border-accent focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => { setValue(source.labels.join(", ")); setEditing(true); }} className="touch rounded-full px-2 text-[12px] font-bold text-muted hover:text-text">
          {source.labels.length ? "Edit labels" : "+ Add labels"}
        </button>
      )}
    </div>
  );
}

/** The server returns <b> highlights from ts_headline. Escape everything except those tags. */
function sanitiseSnippet(html: string): string {
  return html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;b&gt;/g, "<mark class='bg-accent/30 text-text rounded px-0.5'>")
    .replace(/&lt;\/b&gt;/g, "</mark>");
}
