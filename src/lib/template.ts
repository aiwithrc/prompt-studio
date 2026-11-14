// Template mode: deterministic prompt builder, no LLM. Port of the prototype's templatePrompt() (PRD §6.2.4).
import { KID_NEG, KID_STYLE, type OutputType } from "./constants";

export type TemplateForm = {
  type: OutputType;
  idea: string;
  refDesc: string;
  fields: Record<string, string>;
  kidSafe: boolean;
  frames?: number;
};

export type ContextPassage = { text: string };

export function templatePrompt(form: TemplateForm, passages: ContextPassage[] = []): string {
  const f = form.fields;
  const parts: string[] = [];
  const add = (v: string | false | undefined | null) => {
    if (v && String(v).trim()) parts.push(String(v).trim());
  };
  const idea = form.idea.trim();
  const ref = form.refDesc.trim();

  if (form.type === "video" || form.type === "image") {
    const isVideo = form.type === "video";
    const base = idea || ref;
    const lead = [f.subject, f.action].map((s) => (s || "").trim()).filter(Boolean).join(", ");
    add(lead ? (base ? `${base}. ${lead}` : lead) : base);
    if (idea && ref) add(`Based on the reference: ${ref}`);
    add(f.setting && `Setting: ${f.setting}`);
    add(f.camera && `${isVideo ? "Camera" : "Framing"}: ${f.camera}`);
    add(f.style && `Style and lighting: ${f.style}`);
    if (isVideo) add(f.sound && `Sound: ${f.sound}`);
    if (form.kidSafe) add(`Kid-safe: ${KID_STYLE}`);
    if (isVideo) add("Show the action clearly over time, no on-screen text");
    return parts.join(". ").replace(/\.\./g, ".") + (parts.length ? "." : "");
  }

  const notes = passages
    .map((p) => `- ${p.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");

  if (form.type === "text") {
    add(`Act as an expert assistant. Task: ${idea || "—"}`);
    add(f.audience && `Audience: ${f.audience}`);
    add(f.tone && `Tone: ${f.tone}`);
    add(f.format && `Format: ${f.format}`);
    add(f.length && `Length: ${f.length}`);
    add(f.constraints && `Constraints: ${f.constraints}`);
    if (form.kidSafe) add("Use simple, family-friendly language");
    add("Write the output as plain text");
  } else {
    add(`Write a LinkedIn post about: ${idea || "—"}`);
    add(f.audience && `Audience: ${f.audience}`);
    add(`Tone: ${f.tone || "candid, first-person, practical"}`);
    add(f.hook && `Open with this hook: ${f.hook}`);
    add(f.takeaway && `Key takeaway: ${f.takeaway}`);
    add(f.cta && `End with: ${f.cta}`);
    add(`Length: ${f.length || "150–250 words"}`);
    add("Use short paragraphs and plain language, at most 3 hashtags, no emoji overload");
  }
  return parts.join(".\n") + "." + (notes ? `\n\nUse these notes as context:\n${notes}` : "");
}

/** Negative prompt for video/image: user's text plus kid-safe terms. Empty for text/linkedin. */
export function templateNegative(type: OutputType, negative: string, kidSafe: boolean): string {
  if (type !== "video" && type !== "image") return "";
  return [negative.trim(), kidSafe ? KID_NEG : ""].filter(Boolean).join(", ");
}
