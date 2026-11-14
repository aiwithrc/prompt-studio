// Header stat tiles (TRK-03): saved prompts, worked rate, knowledge passages.
import { sql } from "./db";

export async function getStats(userId: string) {
  const [p] = await sql<{ total: number; worked: number; rated: number }[]>`
    select count(*)::int as total,
           count(*) filter (where rating = 1)::int as worked,
           count(*) filter (where rating <> 0)::int as rated
    from prompts where user_id = ${userId}
  `;
  const [k] = await sql<{ n: number }[]>`select count(*)::int as n from knowledge_chunks where user_id = ${userId}`;
  return {
    saved: p.total,
    workedRate: p.rated ? `${Math.round((p.worked / p.rated) * 100)}%` : "—",
    passages: k.n,
  };
}
