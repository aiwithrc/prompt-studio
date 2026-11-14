import { z } from "zod";
import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { sql } from "@/lib/db";
import { DEFAULT_ENGINE, SECTIONS, type Section } from "@/lib/constants";
import { customisedSections, getEngine } from "@/lib/settings";

const MAX_SECTION = 20_000;

async function payload(userId: string) {
  const sections = await getEngine(userId);
  const custom = await customisedSections(userId);
  return { sections, defaults: DEFAULT_ENGINE, customised: [...custom] };
}

export const GET = handle(async () => {
  const user = await requireUser();
  return ok(await payload(user.id));
});

const Body = z.object({
  sections: z.record(z.enum(SECTIONS), z.string().max(MAX_SECTION)),
});

// Saving an empty section, or one identical to the default, resets it. Only customised sections are stored (ENG-05).
export const PUT = handle(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, Body);
  for (const [section, content] of Object.entries(body.sections) as [Section, string][]) {
    const trimmed = content.trim();
    if (!trimmed || trimmed === DEFAULT_ENGINE[section].trim()) {
      await sql`delete from engine_sections where user_id = ${user.id} and section = ${section}`;
    } else {
      await sql`
        insert into engine_sections (user_id, section, content) values (${user.id}, ${section}, ${content})
        on conflict (user_id, section) do update set content = excluded.content, updated_at = now()
      `;
    }
  }
  return ok(await payload(user.id));
});
