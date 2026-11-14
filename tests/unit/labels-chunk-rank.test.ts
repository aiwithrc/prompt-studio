import { describe, expect, it } from "vitest";
import { normalizeLabel, parseLabels, splitSearch } from "@/lib/labels";
import { chunkText, estimateTokens, MAX_TOKENS } from "@/lib/chunk";
import { promptBoost, rrf, toRanked } from "@/lib/rank";
import { applyKidSafe, formatContext, parseModelOutput } from "@/lib/parse";

describe("labels (KB-08)", () => {
  it("trims, strips #, lowercases, turns spaces into dashes and dedupes", () => {
    expect(normalizeLabel("  #Brand Voice ")).toBe("brand-voice");
    expect(parseLabels("Brand Voice, #LinkedIn, brand-voice")).toEqual(["brand-voice", "linkedin"]);
  });

  it("splits a search box into words and #label tokens", () => {
    expect(splitSearch("tone #brand")).toEqual({ words: "tone", labels: ["brand"] });
    expect(splitSearch("#brand #Product")).toEqual({ words: "", labels: ["brand", "product"] });
  });
});

describe("chunkText (PRD §9.2)", () => {
  it("returns nothing for blank input", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("keeps a short document as one chunk with ordinal 1", () => {
    const chunks = chunkText("First paragraph.\n\nSecond paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ordinal).toBe(1);
    expect(chunks[0].content).toContain("Second paragraph.");
  });

  it("splits long text into chunks no larger than MAX_TOKENS (plus overlap tolerance)", () => {
    const para = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about prompts and knowledge in some detail.`).join(" ");
    const text = Array.from({ length: 8 }, () => para).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c.content)).toBeLessThanOrEqual(MAX_TOKENS + 60);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i + 1));
  });

  it("keeps a Markdown heading in every chunk of a long document", () => {
    const sentences = (label: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${label} sentence ${i} is here with some words.`).join(" ");
    const md = `# Brand\n\n${sentences("alpha", 60)}\n\n## Tone\n\n${sentences("beta", 60)}`;
    const chunks = chunkText(md, { markdown: true });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => /^#{1,6} /m.test(c.content))).toBe(true);
  });
});

describe("rank (RAG-02, RAG-03)", () => {
  it("RRF: an item ranked high in both lists beats one ranked high in only one", () => {
    const fused = rrf([toRanked(["a", "b", "c"]), toRanked(["b", "a", "d"])]);
    const sorted = [...fused.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id);
    expect(sorted.slice(0, 2).sort()).toEqual(["a", "b"]);
  });

  it("boosts: same type x1.3, worked x1.4, didn't x0.6, favourite x1.2", () => {
    expect(promptBoost({ type: "video", rating: 1, favourite: true }, "video")).toBeCloseTo(1.3 * 1.4 * 1.2);
    expect(promptBoost({ type: "image", rating: -1, favourite: false }, "video")).toBeCloseTo(0.6);
  });
});

describe("parse (PRD §6.6.3)", () => {
  it("reads JSON directly, or the first {...} block inside surrounding text", () => {
    expect(parseModelOutput('{"prompt":"A cat","negative":"blur"}')).toEqual({ prompt: "A cat", negative: "blur" });
    expect(parseModelOutput('Sure! {"prompt":"A dog","negative":""} Hope it helps')).toEqual({ prompt: "A dog", negative: "" });
  });

  it("treats unparseable output as the prompt itself", () => {
    expect(parseModelOutput("Just a plain prompt")).toEqual({ prompt: "Just a plain prompt", negative: "" });
  });

  it("appends kid-safe negatives for video/image unless 'scary' is already present", () => {
    expect(applyKidSafe("video", "blur", true)).toContain("scary");
    expect(applyKidSafe("video", "scary things", true)).toBe("scary things");
    expect(applyKidSafe("text", "", true)).toBe("");
  });

  it("formats context: 'None.' when empty, and ratings rendered as WORKED / DID NOT WORK / unrated", () => {
    expect(formatContext([])).toBe("None.");
    const out = formatContext([
      { kind: "prompt", title: "t", text: "p1", meta: { rating: 1, type: "video" } },
      { kind: "prompt", title: "t", text: "p2", meta: { rating: -1, type: "image" } },
      { kind: "doc", title: "Brand", text: "note", meta: {} },
    ]);
    expect(out).toContain("WORKED");
    expect(out).toContain("DID NOT WORK");
    expect(out).toContain("KNOWLEDGE NOTE (Brand): note");
  });
});
