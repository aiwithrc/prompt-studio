"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, copyText } from "@/lib/client";
import { FIELDS, FRAME_OPTIONS, IDEA_LABELS, SIZES, TYPE_LABELS, OUTPUT_TYPES, type OutputType } from "@/lib/constants";
import { parseLabels } from "@/lib/labels";
import { Button, Card, Chip, Eyebrow, Field, Notice, TextArea, TextInput } from "@/components/ui";

export type InitialPrompt = {
  id: string;
  type: OutputType;
  mode: "ai" | "template";
  prompt: string;
  negative: string;
  width: number | null;
  height: number | null;
  frames: number | null;
  idea: string;
  refDesc: string;
  fields: Record<string, string>;
  kidSafe: boolean;
  collection: string;
  tags: string[];
  favourite: boolean;
  rating: number;
  uses: number;
  provider: string | null;
  model: string | null;
};

type Defaults = { mode: "ai" | "template"; topK: number; showScores: boolean; kidSafe: boolean };

type Hit = {
  kind: "prompt" | "doc";
  id: string;
  score: number;
  title: string;
  snippet: string;
  meta: { type?: OutputType; rating?: number; favourite?: boolean; labels?: string[] };
};

type Result = {
  prompt: string;
  negative: string;
  meta: { label: string; sources: number; width?: number; height?: number; frames?: number; latencyMs: number; mode: string };
  fallback: boolean;
  error?: string;
};

const segBtn = (active: boolean) =>
  `touch flex-1 rounded-full px-3 text-sm font-bold transition ${active ? "bg-accent text-[#1b0b33]" : "text-muted hover:text-text"}`;

export function GenerateView({ initial, defaults }: { initial: InitialPrompt | null; defaults: Defaults }) {
  const [type, setType] = useState<OutputType>(initial?.type ?? "video");
  const [mode, setMode] = useState<"ai" | "template">(initial?.mode ?? defaults.mode);
  const [sizeIndex, setSizeIndex] = useState(() => {
    const t = initial?.type ?? "video";
    if (t !== "video" && t !== "image") return 0;
    const i = SIZES[t].findIndex((s) => s.w === initial?.width && s.h === initial?.height);
    return i >= 0 ? i : 0;
  });
  const [frames, setFrames] = useState<number>(initial?.frames ?? FRAME_OPTIONS[0]);
  const [idea, setIdea] = useState(initial?.idea ?? "");
  const [refDesc, setRefDesc] = useState(initial?.refDesc ?? "");
  const [fields, setFields] = useState<Record<string, string>>(initial?.fields ?? {});
  const [negative, setNegative] = useState(""); // "Avoid" input (video/image)
  const [kidSafe, setKidSafe] = useState(initial?.kidSafe ?? defaults.kidSafe);
  const [showDetails, setShowDetails] = useState(Boolean(initial && Object.values(initial.fields).some(Boolean)));
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [useLibrary, setUseLibrary] = useState(true);
  const [useKnowledge, setUseKnowledge] = useState(true);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [knowledgeLabels, setKnowledgeLabels] = useState<{ name: string; count: number }[]>([]);
  const [collection, setCollection] = useState(initial?.collection ?? "");
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));

  const [hits, setHits] = useState<Hit[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [contextError, setContextError] = useState("");

  const [result, setResult] = useState<Result | null>(
    initial
      ? {
          prompt: initial.prompt,
          negative: initial.negative,
          meta: { label: initial.provider ? initial.provider.toUpperCase() : "SAVED", sources: 0, width: initial.width ?? undefined, height: initial.height ?? undefined, frames: initial.frames ?? undefined, latencyMs: 0, mode: initial.mode },
          fallback: false,
        }
      : null,
  );
  const [recordId, setRecordId] = useState<string | null>(initial?.id ?? null);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [favourite, setFavourite] = useState(initial?.favourite ?? false);
  const [uses, setUses] = useState(initial?.uses ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const isMedia = type === "video" || type === "image";
  const fieldDefs = FIELDS[type];
  const hasContent = Boolean(idea.trim() || refDesc.trim() || Object.values(fields).some((v) => v?.trim()));

  // Knowledge label chips (KB-07 counts). Loaded once.
  useEffect(() => {
    api<{ labels: { name: string; count: number }[] }>("/api/knowledge")
      .then((r) => setKnowledgeLabels(r.labels))
      .catch(() => setKnowledgeLabels([]));
  }, []);

  // Live Retrieved Context: debounced 300 ms as the user types (GEN-15).
  const retrieveBody = useMemo(
    () => ({
      type,
      idea,
      refDesc,
      fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v?.trim())),
      tags: parseLabels(tagsText),
      collection,
      useLibrary,
      useKnowledge,
      labels: labelFilter,
      excludedHitIds: [],
      currentPromptId: initial?.id,
    }),
    [type, idea, refDesc, fields, tagsText, collection, useLibrary, useKnowledge, labelFilter, initial?.id],
  );
  const reqSeq = useRef(0);
  useEffect(() => {
    if (!hasContent && labelFilter.length === 0) {
      setHits([]);
      return;
    }
    const seq = ++reqSeq.current;
    const t = setTimeout(() => {
      api<{ hits: Hit[] }>("/api/retrieve", { method: "POST", json: retrieveBody })
        .then((r) => {
          if (seq === reqSeq.current) {
            setHits(r.hits);
            setContextError("");
          }
        })
        .catch((e) => {
          if (seq === reqSeq.current) setContextError(e instanceof ApiError ? e.message : "Could not load context.");
        });
    }, 300);
    return () => clearTimeout(t);
  }, [retrieveBody, hasContent, labelFilter.length]);

  function resetForm() {
    setIdea("");
    setRefDesc("");
    setFields({});
    setNegative("");
    setResult(null);
    setRecordId(null);
    setRating(0);
    setFavourite(false);
    setUses(0);
    setCollection("");
    setTagsText("");
    setExcluded(new Set());
    setError("");
    setStatus("Form cleared.");
    // Kid-safe preference is kept (GEN-14).
  }

  function setField(name: string, value: string) {
    setFields((f) => ({ ...f, [name]: value }));
  }

  function onRefFile(file: File | undefined) {
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefPreview(file ? URL.createObjectURL(file) : null);
  }

  async function generate() {
    setError("");
    if (!hasContent) {
      setError("Enter an idea or some details first.");
      return;
    }
    setBusy(true);
    setStatus("Generating…");
    try {
      const r = await api<Result & { hits: Hit[] }>("/api/generate", {
        method: "POST",
        json: {
          type,
          mode,
          sizeIndex: isMedia ? sizeIndex : undefined,
          frames: type === "video" ? frames : undefined,
          idea,
          refDesc,
          fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v?.trim())),
          negative: isMedia ? negative : "",
          kidSafe: type === "linkedin" ? false : kidSafe,
          tags: parseLabels(tagsText),
          collection,
          useLibrary,
          useKnowledge,
          labels: labelFilter,
          excludedHitIds: [...excluded],
          currentPromptId: initial?.id,
        },
      });
      setResult(r);
      setRecordId(null); // a new generation is unsaved until the user saves it
      setRating(0);
      setFavourite(false);
      setUses(0);
      setStatus(r.error ? "Generated with the template." : "Prompt ready.");
      if (r.error) setError(r.error);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Generation failed. Try again.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function payload() {
    const size = isMedia ? SIZES[type as "video" | "image"][sizeIndex] : undefined;
    return {
      type,
      mode: result?.meta.mode === "template" ? "template" : "ai",
      prompt: result?.prompt ?? "",
      negative: result?.negative ?? "",
      width: size?.w ?? result?.meta.width ?? null,
      height: size?.h ?? result?.meta.height ?? null,
      frames: type === "video" ? frames : null,
      idea,
      refDesc,
      fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v?.trim())),
      kidSafe: type === "linkedin" ? false : kidSafe,
      negInput: negative,
      collection: collection.trim(),
      tags: parseLabels(tagsText),
      favourite,
      rating,
      provider: result?.meta.label ?? null,
      model: null,
    };
  }

  async function save(): Promise<string | null> {
    if (!result) return null;
    setError("");
    try {
      if (recordId) {
        await api(`/api/prompts/${recordId}`, {
          method: "PATCH",
          json: {
            prompt: result.prompt,
            negative: result.negative,
            idea,
            collection: collection.trim(),
            tags: parseLabels(tagsText),
            favourite,
            rating,
          },
        });
        setStatus("Updated in your library.");
        return recordId;
      }
      const saved = await api<{ id: string }>("/api/prompts", { method: "POST", json: payload() });
      setRecordId(saved.id);
      setStatus("Saved to your library.");
      return saved.id;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
      return null;
    }
  }

  async function copy() {
    if (!result) return;
    const text = result.prompt + (result.negative ? `\n\nNegative: ${result.negative}` : "");
    const ok = await copyText(text);
    setStatus(ok ? "Copied." : "Copy failed. Select the text and copy it manually.");
    if (ok && recordId) {
      const r = await api<{ uses: number }>(`/api/prompts/${recordId}/copy`, { method: "POST" }).catch(() => null);
      if (r) setUses(r.uses);
    }
  }

  async function toggleFavourite() {
    const id = recordId ?? (await save());
    if (!id) return;
    const next = !favourite;
    setFavourite(next);
    await api(`/api/prompts/${id}`, { method: "PATCH", json: { favourite: next } }).catch(() => setFavourite(!next));
  }

  async function setRatingValue(value: 1 | -1) {
    const id = recordId ?? (await save());
    if (!id) return;
    const next = rating === value ? 0 : value;
    setRating(next);
    await api(`/api/prompts/${id}`, { method: "PATCH", json: { rating: next } }).catch(() => setRating(rating));
  }

  const sizeOptions = isMedia ? SIZES[type as "video" | "image"] : [];
  const sizeGroups = [...new Set(sizeOptions.map((s) => s.group))];
  const included = hits.filter((h) => !excluded.has(h.id));

  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6 lg:grid-cols-2">
      {/* LEFT: 01 OUTPUT, 02 INPUT */}
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <Eyebrow>01 · Output</Eyebrow>
          <div role="group" aria-label="Output type" className="flex rounded-full border border-border bg-surface-deep p-1">
            {OUTPUT_TYPES.map((t) => (
              <button key={t} type="button" className={segBtn(type === t)} aria-pressed={type === t} onClick={() => { setType(t); setSizeIndex(0); }}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Mode" className="flex rounded-full border border-border bg-surface-deep p-1">
            <button type="button" className={segBtn(mode === "ai")} aria-pressed={mode === "ai"} onClick={() => setMode("ai")}>
              AI + RAG
            </button>
            <button type="button" className={segBtn(mode === "template")} aria-pressed={mode === "template"} onClick={() => setMode("template")}>
              Template
            </button>
          </div>

          {isMedia ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Size / aspect ratio" htmlFor="size">
                <select id="size" value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text focus:border-accent focus:outline-none">
                  {sizeGroups.map((g) => (
                    <optgroup key={g} label={g}>
                      {sizeOptions.map((s, i) => (s.group === g ? <option key={`${g}-${i}`} value={i}>{`${s.label} · ${s.w}×${s.h}`}</option> : null))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {type === "video" ? (
                <Field label="Video length" htmlFor="frames" hint="Width and height are multiples of 32; frame counts are 8n+1.">
                  <select id="frames" value={frames} onChange={(e) => setFrames(Number(e.target.value))} className="touch rounded-[10px] border border-border bg-surface-deep px-3 text-[15px] text-text focus:border-accent focus:outline-none">
                    <option value={97}>97 frames (~4 s)</option>
                    <option value={153}>153 frames (~6 s)</option>
                    <option value={241}>241 frames (~10 s)</option>
                  </select>
                </Field>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <Eyebrow>02 · Input</Eyebrow>
          <Field label={IDEA_LABELS[type]} htmlFor="idea">
            <TextArea id="idea" value={idea} maxLength={4000} onChange={(e) => setIdea(e.target.value)} placeholder={type === "text" ? "e.g. Explain our pricing change to existing customers" : "Describe the idea in one or two lines"} />
          </Field>

          <button type="button" onClick={() => setShowDetails((s) => !s)} aria-expanded={showDetails} className="touch self-start text-sm font-bold text-lilac hover:underline">
            {showDetails ? "− Hide details" : "+ Add details (optional)"}
          </button>

          {showDetails ? (
            <Card className="flex flex-col gap-4">
              {fieldDefs.map((f) => (
                <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`}>
                  <TextInput id={`f-${f.name}`} value={fields[f.name] ?? ""} placeholder={f.placeholder} onChange={(e) => setField(f.name, e.target.value)} />
                </Field>
              ))}

              {isMedia ? (
                <>
                  <Field label="Reference image" htmlFor="ref-image" hint="Shown here for your reference. The image is not sent to the model yet; describe it below.">
                    <input id="ref-image" type="file" accept="image/*" onChange={(e) => onRefFile(e.target.files?.[0])} className="text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-btn-secondary file:px-4 file:py-2 file:font-bold file:text-white" />
                  </Field>
                  {refPreview ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={refPreview} alt="Reference image preview" className="max-h-28 rounded-lg border border-border" />
                      <Button variant="ghost" onClick={() => onRefFile(undefined)}>Remove</Button>
                    </div>
                  ) : null}
                  <Field label="Describe the reference" htmlFor="ref-desc">
                    <TextArea id="ref-desc" value={refDesc} onChange={(e) => setRefDesc(e.target.value)} placeholder="e.g. a red fox in a snowy birch forest, low sun" />
                  </Field>
                  <Field label="Avoid (negative prompt)" htmlFor="avoid">
                    <TextInput id="avoid" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="e.g. extra limbs, watermark" />
                  </Field>
                </>
              ) : null}

              {type !== "linkedin" ? (
                <label className="flex items-center gap-3 text-sm text-text">
                  <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} className="size-4 accent-[#ff8a4c]" />
                  <span>
                    Kid-safe mode <span className="text-faint">(adds gentle style and safety terms)</span>
                  </span>
                </label>
              ) : null}
            </Card>
          ) : null}

          {type !== "linkedin" && !showDetails ? (
            <label className="flex items-center gap-3 text-sm text-text">
              <input type="checkbox" checked={kidSafe} onChange={(e) => setKidSafe(e.target.checked)} className="size-4 accent-[#ff8a4c]" />
              Kid-safe mode
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={generate} disabled={busy}>
              {busy ? "Generating…" : "Generate"}
            </Button>
            <Button variant="ghost" onClick={resetForm} disabled={busy}>
              Clear form
            </Button>
          </div>
          <Notice tone="error">{error}</Notice>
        </section>
      </div>

      {/* RIGHT: 03 RESULT, 04 RETRIEVED CONTEXT */}
      <div className="flex flex-col gap-6">
        <section aria-label="Result" className="result-gradient flex flex-col gap-4 rounded-2xl border border-border p-5 md:p-6">
          <Eyebrow>03 · Result</Eyebrow>
          {result ? (
            <>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">{result.prompt}</p>
              {result.negative ? (
                <p className="text-sm text-muted">
                  <span className="font-bold text-pink">Avoid: </span>
                  {result.negative}
                </p>
              ) : null}
              <p className="text-[12px] font-semibold tracking-wide text-faint">
                {result.meta.label} · {result.meta.sources} SOURCES
                {result.meta.width && result.meta.height ? ` · ${result.meta.width}×${result.meta.height}` : ""}
                {result.meta.frames ? ` · ${result.meta.frames}F` : ""}
                {result.meta.latencyMs ? ` · ${(result.meta.latencyMs / 1000).toFixed(1)} s` : ""}
                {uses ? ` · USED ${uses}×` : ""}
              </p>
              {result.error ? <Notice tone="error">{result.error}</Notice> : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copy}>Copy</Button>
                <Button variant="ghost" onClick={save}>{recordId ? "Update" : "Save"}</Button>
                <Button variant="ghost" onClick={toggleFavourite} aria-pressed={favourite}>
                  {favourite ? "★ Favourite" : "☆ Favourite"}
                </Button>
                <Chip active={rating === 1} onClick={() => setRatingValue(1)}>Worked</Chip>
                <Chip active={rating === -1} onClick={() => setRatingValue(-1)}>Didn't</Chip>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Collection" htmlFor="collection">
                  <TextInput id="collection" value={collection} maxLength={80} onChange={(e) => setCollection(e.target.value)} placeholder="e.g. Weekly LinkedIn" />
                </Field>
                <Field label="Tags" htmlFor="tags" hint="Comma separated">
                  <TextInput id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="brand, launch" />
                </Field>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Your prompt will appear here. Generate one to get started.</p>
          )}
          <p role="status" aria-live="polite" className="text-[12px] text-faint">{status}</p>
        </section>

        <section aria-label="Retrieved context" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>04 · Retrieved context</Eyebrow>
            <span className="text-[12px] text-faint">{included.length} included</span>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Sources">
            <Chip active={useLibrary} onClick={() => setUseLibrary((v) => !v)}>Library</Chip>
            <Chip active={useKnowledge} onClick={() => setUseKnowledge((v) => !v)}>Knowledge</Chip>
          </div>

          {useKnowledge && knowledgeLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Knowledge labels">
              <Chip active={labelFilter.length === 0} onClick={() => setLabelFilter([])}>All</Chip>
              {knowledgeLabels.map((l) => (
                <Chip key={l.name} active={labelFilter.includes(l.name)} onClick={() => setLabelFilter((cur) => (cur.includes(l.name) ? cur.filter((x) => x !== l.name) : [...cur, l.name]))}>
                  #{l.name} <span className="ml-1 opacity-70">{l.count}</span>
                </Chip>
              ))}
            </div>
          ) : null}

          <Notice tone="error">{contextError}</Notice>

          {!hasContent && labelFilter.length === 0 ? (
            <Card><p className="text-sm text-muted">Type an idea and matching prompts from your library and passages from your knowledge base appear here.</p></Card>
          ) : hits.length === 0 ? (
            <Card><p className="text-sm text-muted">Nothing relevant found yet. Save prompts or add knowledge to build context.</p></Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {hits.map((h) => {
                const on = !excluded.has(h.id);
                const badge =
                  h.kind === "doc"
                    ? { text: "KNOWLEDGE", cls: "text-cyan border-cyan/40" }
                    : h.meta.rating === 1
                      ? { text: "WORKED", cls: "text-cyan border-cyan/40" }
                      : h.meta.rating === -1
                        ? { text: "DIDN'T WORK", cls: "text-pink border-pink/40" }
                        : { text: (h.meta.type ?? "prompt").toUpperCase(), cls: "text-muted border-border" };
                return (
                  <li key={h.id} className={`rounded-2xl border bg-surface p-4 ${on ? "border-border" : "border-divider opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={on} aria-label={`Include ${h.title}`} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(h.id)) n.delete(h.id); else n.add(h.id); return n; })} className="mt-1 size-4 accent-[#ff8a4c]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${badge.cls}`}>{badge.text}</span>
                          {defaults.showScores ? <span className="text-[11px] text-faint">score {h.score.toFixed(3)}</span> : null}
                        </div>
                        <p className="mt-2 truncate text-[14px] font-semibold text-text" title={h.title}>{h.title}</p>
                        <p className="mt-1 text-[13px] text-muted">{h.snippet}</p>
                        {h.kind === "prompt" ? (
                          <Link href={`/generate?open=${h.id}`} className="mt-2 inline-block text-[13px] font-bold text-lilac hover:underline">
                            Open this prompt →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
