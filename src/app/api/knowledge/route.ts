import { z } from "zod";
import { handle, ok, fail, HttpError, requireUser } from "@/lib/api";
import { createSource, listSources, readUploadText, MAX_FILE_BYTES } from "@/lib/knowledge";
import { parseLabels } from "@/lib/labels";
import { rateLimit } from "@/lib/rate-limit";

export const GET = handle(async (req) => {
  const user = await requireUser();
  const u = new URL(req.url);
  const q = u.searchParams.get("q") ?? "";
  const labels = (u.searchParams.get("labels") ?? "").split(",").filter(Boolean);
  return ok(await listSources(user.id, q, labels));
});

const Pasted = z.object({
  title: z.string().max(200).default(""),
  text: z.string().min(1, "Paste some text first.").max(MAX_FILE_BYTES),
  labels: z.union([z.string(), z.array(z.string())]).default(""),
});

// Multipart: title?, text?, labels, files[] (KB-01, KB-02). JSON: {title, text, labels} for pasted text.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const limit = rateLimit(`ingest:${user.id}`, 20, 60_000); // NFR-04
  if (!limit.ok) return fail(429, "rate_limited", `Too many uploads. Try again in ${limit.retryAfter} seconds.`);

  const type = req.headers.get("content-type") ?? "";
  const created = [];

  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const labels = parseLabels(String(form.get("labels") ?? ""));
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const pasted = String(form.get("text") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    if (files.length === 0 && !pasted) throw new HttpError(400, "empty", "Add a file or paste some text.");

    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { text, mime } = readUploadText(f.name, bytes);
      created.push(await createSource(user.id, f.name.replace(/\.(txt|md)$/i, ""), labels, text, mime));
    }
    if (pasted) created.push(await createSource(user.id, title || "Pasted text", labels, pasted, "text/plain"));
  } else {
    const parsed = Pasted.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "validation", parsed.error.issues[0]?.message ?? "Invalid input.");
    const body = parsed.data;
    const labels = parseLabels(body.labels);
    created.push(await createSource(user.id, body.title, labels, body.text, "text/plain"));
  }
  return ok({ sources: created }, 201);
});
