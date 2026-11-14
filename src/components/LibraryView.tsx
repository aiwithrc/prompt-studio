"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, copyText } from "@/lib/client";
import { TYPE_LABELS, type OutputType } from "@/lib/constants";
import { Button, Chip, Notice, TextInput } from "@/components/ui";

export type PromptItem = {
  id: string;
  type: OutputType;
  mode: "ai" | "template";
  prompt: string;
  negative: string;
  width: number | null;
  height: number | null;
  frames: number | null;
  idea: string;
  collection: string;
  tags: string[];
  favourite: boolean;
  rating: number;
  uses: number;
  createdAt: string | Date;
};

type Filters = { q: string; type: string; rating: string; fav: boolean; collection: string; tag: string; sort: string };

const RATING_OPTIONS = [
  { value: "any", label: "Any rating" },
  { value: "worked", label: "Worked" },
  { value: "didnt", label: "Didn't work" },
  { value: "unrated", label: "Unrated" },
];

export function LibraryView({
  initialItems,
  initialCursor,
  initialFilters,
  collections,
  tags,
}: {
  initialItems: PromptItem[];
  initialCursor: string | null;
  initialFilters: Filters;
  collections: string[];
  tags: string[];
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [items, setItems] = useState<PromptItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);

  // Re-query when filters change (the first page is also fetched client-side so chips feel instant).
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.type !== "all") qs.set("type", filters.type);
    if (filters.rating !== "any") qs.set("rating", filters.rating);
    if (filters.fav) qs.set("fav", "1");
    if (filters.collection) qs.set("collection", filters.collection);
    if (filters.tag) qs.set("tag", filters.tag);
    if (filters.sort !== "recent") qs.set("sort", filters.sort);
    const timer = setTimeout(() => {
      api<{ items: PromptItem[]; nextCursor: string | null }>(`/api/prompts?${qs.toString()}`)
        .then((r) => {
          if (!cancelled) {
            setItems(r.items);
            setCursor(r.nextCursor);
            setError("");
          }
        })
        .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load prompts."));
      const url = `/library${qs.toString() ? `?${qs.toString()}` : ""}`;
      window.history.replaceState(null, "", url);
    }, filters.q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, reload]);

  function set<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters((f) => ({ ...f, [k]: v }));
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy(true);
    const qs = new URLSearchParams({ cursor });
    if (filters.q) qs.set("q", filters.q);
    if (filters.type !== "all") qs.set("type", filters.type);
    if (filters.rating !== "any") qs.set("rating", filters.rating);
    if (filters.fav) qs.set("fav", "1");
    if (filters.collection) qs.set("collection", filters.collection);
    if (filters.tag) qs.set("tag", filters.tag);
    if (filters.sort !== "recent") qs.set("sort", filters.sort);
    try {
      const r = await api<{ items: PromptItem[]; nextCursor: string | null }>(`/api/prompts?${qs.toString()}`);
      setItems((cur) => [...cur, ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load more.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(p: PromptItem) {
    const text = p.prompt + (p.negative ? `\n\nNegative: ${p.negative}` : "");
    const ok = await copyText(text);
    setStatus(ok ? "Copied." : "Copy failed.");
    if (ok) {
      const r = await api<{ uses: number }>(`/api/prompts/${p.id}/copy`, { method: "POST" }).catch(() => null);
      if (r) setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, uses: r.uses } : x)));
    }
  }

  async function toggleFav(p: PromptItem) {
    const next = !p.favourite;
    setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, favourite: next } : x)));
    await api(`/api/prompts/${p.id}`, { method: "PATCH", json: { favourite: next } }).catch(() =>
      setItems((cur) => cur.map((x) => (x.id === p.id ? { ...x, favourite: p.favourite } : x))),
    );
  }

  async function remove(p: PromptItem) {
    if (!window.confirm("Delete this prompt? This cannot be undone.")) return;
    await api(`/api/prompts/${p.id}`, { method: "DELETE" });
    setItems((cur) => cur.filter((x) => x.id !== p.id));
    setStatus("Prompt deleted.");
  }

  async function sortAndFilterReset() {
    setFilters({ q: "", type: "all", rating: "any", fav: false, collection: "", tag: "", sort: "recent" });
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="lib-q" className="mb-1.5 block text-[12px] font-semibold text-muted">Search</label>
          <TextInput id="lib-q" value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder="Search prompt, idea, tags, collection" />
        </div>
        <div>
          <label htmlFor="lib-rating" className="mb-1.5 block text-[12px] font-semibold text-muted">Rating</label>
          <select id="lib-rating" value={filters.rating} onChange={(e) => set("rating", e.target.value)} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text">
            {RATING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lib-sort" className="mb-1.5 block text-[12px] font-semibold text-muted">Sort</label>
          <select id="lib-sort" value={filters.sort} onChange={(e) => set("sort", e.target.value)} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text">
            <option value="recent">Most recent</option>
            <option value="used">Most used</option>
            <option value="worked">Worked first</option>
          </select>
        </div>
        <Button variant="ghost" onClick={sortAndFilterReset}>Reset</Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Type">
        {["all", "video", "image", "text", "linkedin"].map((t) => (
          <Chip key={t} active={filters.type === t} onClick={() => set("type", t)}>
            {t === "all" ? "All types" : TYPE_LABELS[t as OutputType]}
          </Chip>
        ))}
        <Chip active={filters.fav} onClick={() => set("fav", !filters.fav)}>★ Favourites</Chip>
      </div>

      {collections.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Collections">
          <Chip active={!filters.collection} onClick={() => set("collection", "")}>All collections</Chip>
          {collections.map((c) => (
            <Chip key={c} active={filters.collection === c} onClick={() => set("collection", c)}>{c}</Chip>
          ))}
        </div>
      ) : null}

      {filters.tag ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          Tag: <Chip active onClick={() => set("tag", "")}>#{filters.tag} ✕</Chip>
        </div>
      ) : tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
          Tags:
          {tags.slice(0, 15).map((t) => (
            <button key={t} type="button" onClick={() => set("tag", t)} className="touch rounded-full px-2 text-lilac hover:underline">
              #{t}
            </button>
          ))}
        </div>
      ) : null}

      <Notice tone="error">{error}</Notice>
      <p role="status" aria-live="polite" className="text-[12px] text-faint">{status}</p>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-muted">
          No prompts match these filters. <Link href="/generate" className="font-bold text-lilac hover:underline">Generate one</Link>.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-accent/50 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-accent-text">
                  {TYPE_LABELS[p.type].toUpperCase()}
                </span>
                <span className="text-[12px] text-faint">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              {p.collection ? <p className="text-[13px] font-semibold text-lilac">{p.collection}</p> : null}
              <p className="line-clamp-4 whitespace-pre-wrap text-[14px] text-text">{p.prompt}</p>
              {p.tags.length ? (
                <div className="flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <button key={t} type="button" onClick={() => set("tag", t)} className="touch rounded-full px-1 text-[12px] text-lilac hover:underline">
                      #{t}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-[12px] text-faint">
                {p.width && p.height ? `${p.width}×${p.height} · ` : ""}Used {p.uses}×
                {p.rating === 1 ? " · Worked" : p.rating === -1 ? " · Didn't work" : ""}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/generate?open=${p.id}`} className="touch inline-flex items-center rounded-full bg-btn-secondary px-4 text-sm font-bold text-white hover:brightness-110">
                  Open
                </Link>
                <Button variant="ghost" onClick={() => copy(p)}>Copy</Button>
                <Button variant="ghost" onClick={() => toggleFav(p)} aria-pressed={p.favourite} aria-label={p.favourite ? "Unfavourite" : "Favourite"}>
                  {p.favourite ? "★" : "☆"}
                </Button>
                <Button variant="danger" onClick={() => remove(p)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={loadMore} disabled={busy}>{busy ? "Loading…" : "Load more"}</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <span className="text-muted">Move prompts between machines, or back them up.</span>
        <div className="flex flex-wrap gap-2">
          <a href="/api/prompts/export" className="touch inline-flex items-center rounded-full border border-border-strong px-4 font-bold text-text hover:bg-white/5">
            Export JSON
          </a>
          <ImportButton onDone={() => setReload((r) => r + 1)} onError={setError} onStatus={setStatus} />
        </div>
      </div>
    </div>
  );
}

function ImportButton({ onDone, onError, onStatus }: { onDone: () => void; onError: (m: string) => void; onStatus: (m: string) => void }) {
  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const r = await api<{ imported: number; skipped: number; errors: string[] }>("/api/prompts/import", { method: "POST", json });
      onStatus(`Imported ${r.imported}, skipped ${r.skipped} duplicates${r.errors.length ? `, ${r.errors.length} could not be read` : ""}.`);
      onDone();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "That file is not a valid export.");
    }
  }
  return (
    <label className="touch inline-flex cursor-pointer items-center rounded-full border border-border-strong px-4 font-bold text-text hover:bg-white/5">
      Import JSON
      <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
    </label>
  );
}
