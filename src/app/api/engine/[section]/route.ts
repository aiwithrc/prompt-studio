import { handle, fail, requireUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { SECTIONS, type Section } from "@/lib/constants";
import { getEngine } from "@/lib/settings";

// Reset one section to the built-in default (ENG-02).
export const DELETE = handle(async (_req, ctx) => {
  const user = await requireUser();
  const { section } = await (ctx as unknown as { params: Promise<{ section: string }> }).params;
  if (!SECTIONS.includes(section as Section)) return fail(404, "not_found", "Unknown section.");
  await sql`delete from engine_sections where user_id = ${user.id} and section = ${section}`;
  return new Response(JSON.stringify({ sections: await getEngine(user.id) }), {
    headers: { "content-type": "application/json" },
  });
});
