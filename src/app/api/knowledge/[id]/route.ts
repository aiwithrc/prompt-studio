import { z } from "zod";
import { handle, ok, fail, parseBody, requireUser } from "@/lib/api";
import { deleteSource, updateSource } from "@/lib/knowledge";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  title: z.string().max(200).optional(),
  labels: z.union([z.string(), z.array(z.string())]).optional(),
});

export const PATCH = handle(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as Ctx).params;
  const body = await parseBody(req, Patch);
  const labels = body.labels === undefined ? undefined : Array.isArray(body.labels) ? body.labels : body.labels.split(/[,\n]/);
  const row = await updateSource(user.id, id, { title: body.title, labels });
  return row ? ok(row) : fail(404, "not_found", "Source not found.");
});

export const DELETE = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await (ctx as unknown as Ctx).params;
  return (await deleteSource(user.id, id)) ? new Response(null, { status: 204 }) : fail(404, "not_found", "Source not found.");
});
