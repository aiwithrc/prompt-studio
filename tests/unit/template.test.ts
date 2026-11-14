import { describe, expect, it } from "vitest";
import { templateNegative, templatePrompt } from "@/lib/template";
import { KID_NEG, KID_STYLE } from "@/lib/constants";

describe("templatePrompt", () => {
  it("video: lead, setting, camera, style, sound, kid-safe and the fixed motion line", () => {
    const out = templatePrompt({
      type: "video",
      idea: "a fox in the snow",
      refDesc: "",
      fields: { subject: "red fox", action: "trots", setting: "birch forest", camera: "slow pan", style: "golden hour", sound: "crunching snow" },
      kidSafe: true,
    });
    expect(out.startsWith("a fox in the snow. red fox, trots")).toBe(true);
    expect(out).toContain("Setting: birch forest");
    expect(out).toContain("Camera: slow pan");
    expect(out).toContain("Style and lighting: golden hour");
    expect(out).toContain("Sound: crunching snow");
    expect(out).toContain(`Kid-safe: ${KID_STYLE}`);
    expect(out.endsWith("Show the action clearly over time, no on-screen text.")).toBe(true);
    expect(out).not.toContain("..");
  });

  it("video: uses the reference description when there is no idea and says 'Framing' only for images", () => {
    const v = templatePrompt({ type: "video", idea: "", refDesc: "a lighthouse", fields: { camera: "wide" }, kidSafe: false });
    expect(v.startsWith("a lighthouse")).toBe(true);
    expect(v).toContain("Camera: wide");
    const img = templatePrompt({ type: "image", idea: "a lighthouse", refDesc: "", fields: { camera: "wide" }, kidSafe: false });
    expect(img).toContain("Framing: wide");
    expect(img).not.toContain("Sound:");
    expect(img).not.toContain("no on-screen text");
  });

  it("image: includes 'Based on the reference' when both idea and reference are given", () => {
    const out = templatePrompt({ type: "image", idea: "a cat", refDesc: "tabby on a sofa", fields: {}, kidSafe: false });
    expect(out).toContain("Based on the reference: tabby on a sofa");
  });

  it("text: task line, details, kid-safe language and plain-text rule, joined with newlines", () => {
    const out = templatePrompt({
      type: "text",
      idea: "Explain pricing",
      refDesc: "",
      fields: { audience: "customers", tone: "warm" },
      kidSafe: true,
    });
    expect(out.split("\n")[0]).toBe("Act as an expert assistant. Task: Explain pricing.");
    expect(out).toContain("Audience: customers");
    expect(out).toContain("Tone: warm");
    expect(out).toContain("Use simple, family-friendly language");
    expect(out).toContain("Write the output as plain text.");
  });

  it("linkedin: default tone when none given, and appends context notes capped at 300 chars", () => {
    const long = "x".repeat(400);
    const out = templatePrompt(
      { type: "linkedin", idea: "AI in product teams", refDesc: "", fields: {}, kidSafe: true },
      [{ text: long }],
    );
    expect(out).toContain("Tone: candid, first-person, practical");
    expect(out).toContain("Length: 150–250 words");
    expect(out).toContain("at most 3 hashtags");
    expect(out).toContain("Use these notes as context:\n- " + "x".repeat(300));
    expect(out).not.toContain("x".repeat(301));
  });
});

describe("templateNegative", () => {
  it("adds kid-safe terms for video and image only", () => {
    expect(templateNegative("video", "blur", true)).toBe(`blur, ${KID_NEG}`);
    expect(templateNegative("image", "", false)).toBe("");
    expect(templateNegative("text", "anything", true)).toBe("");
  });
});
