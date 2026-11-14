"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { JSON_RULE, SECTIONS, type Section } from "@/lib/constants";
import { Button, Card, Chip, Eyebrow, Notice } from "@/components/ui";

const LABELS: Record<Section, string> = {
  base: "Core rules",
  video: "Video",
  image: "Image",
  text: "Text",
  linkedin: "LinkedIn post",
};

export function EngineView({
  initialSections,
  defaults,
  initialCustomised,
}: {
  initialSections: Record<Section, string>;
  defaults: Record<Section, string>;
  initialCustomised: Section[];
}) {
  const [saved, setSaved] = useState<Record<Section, string>>(initialSections);
  const [draft, setDraft] = useState<Record<Section, string>>(initialSections);
  const [customised, setCustomised] = useState<Set<Section>>(new Set(initialCustomised));
  const [active, setActive] = useState<Section>("base");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty = SECTIONS.some((s) => draft[s] !== saved[s]);

  // ENG-03/ENG-04: system message = core + type section + fixed JSON rule.
  const preview = useMemo(() => {
    const typeText = active === "base" ? "" : draft[active];
    return [draft.base.trim(), typeText.trim(), JSON_RULE].filter(Boolean).join("\n\n");
  }, [draft, active]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sections: Record<Section, string>; customised: Section[] }>("/api/engine", {
        method: "PUT",
        json: { sections: draft },
      });
      setSaved(r.sections);
      setDraft(r.sections);
      setCustomised(new Set(r.customised));
      setStatus("Engine saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the engine.");
    } finally {
      setBusy(false);
    }
  }

  async function reset(section: Section) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sections: Record<Section, string> }>(`/api/engine/${section}`, { method: "DELETE" });
      setSaved(r.sections);
      setDraft((d) => ({ ...d, [section]: r.sections[section] }));
      setCustomised((c) => {
        const n = new Set(c);
        n.delete(section);
        return n;
      });
      setStatus(`${LABELS[section]} reset to default.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 md:px-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="flex flex-col gap-4">
        <Eyebrow>Sections</Eyebrow>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Engine sections">
          {SECTIONS.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={active === s}
              onClick={() => setActive(s)}
              className={`touch rounded-full px-4 text-sm font-bold ${active === s ? "bg-accent text-[#1b0b33]" : "border border-border text-muted hover:text-text"}`}
            >
              {LABELS[s]}
              {customised.has(s) ? <span className="ml-1.5" aria-label="customised">•</span> : null}
            </button>
          ))}
        </div>

        <label htmlFor="engine-text" className="sr-only">{LABELS[active]} instructions</label>
        <textarea
          id="engine-text"
          value={draft[active]}
          onChange={(e) => setDraft((d) => ({ ...d, [active]: e.target.value }))}
          rows={18}
          spellCheck={false}
          className="min-h-[360px] w-full rounded-2xl border border-border bg-surface-deep p-4 font-mono text-[13px] leading-relaxed text-text focus:border-accent focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || busy}>Save engine</Button>
          <Button variant="ghost" onClick={() => reset(active)} disabled={busy}>Reset to default</Button>
          {dirty ? <span className="text-sm font-semibold text-accent-text">Unsaved changes</span> : null}
        </div>
        <Notice tone="error">{error}</Notice>
        <p role="status" aria-live="polite" className="text-[12px] text-faint">{status}</p>
      </section>

      <section className="flex flex-col gap-4">
        <Eyebrow>Live preview</Eyebrow>
        <Card>
          <p className="mb-3 text-[12px] text-muted">Full system message for <Chip active>{LABELS[active]}</Chip></p>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-deep p-4 font-mono text-[12px] leading-relaxed text-text">{preview}</pre>
          <p className="mt-3 text-[12px] text-faint">The last line is fixed and cannot be edited. It keeps the output parseable.</p>
        </Card>
        <Card>
          <p className="text-[13px] text-muted">
            Only sections you change are stored. Sections you leave alone follow the built-in defaults, so future improvements reach you automatically.
          </p>
        </Card>
      </section>
    </div>
  );
}
