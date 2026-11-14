import { z } from "zod";
import bcrypt from "bcryptjs";
import { handle, ok, fail, parseBody } from "@/lib/api";
import { sql } from "@/lib/db";
import { ensureProfile } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirm: z.string(),
});

export const POST = handle(async (req) => {
  const body = await parseBody(req, Body);
  if (body.password !== body.confirm) return fail(400, "mismatch", "Passwords don't match.");

  const limit = rateLimit(`signup:${body.email}`, 5, 60_000);
  if (!limit.ok) return fail(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfter} seconds.`);

  const [existing] = await sql`select 1 from users where email = ${body.email}`;
  if (existing) return fail(409, "exists", "An account with this email already exists.");

  const hash = await bcrypt.hash(body.password, 12);
  const [user] = await sql<{ id: string }[]>`
    insert into users (email, password_hash) values (${body.email}, ${hash}) returning id
  `;
  await ensureProfile(user.id);
  return ok({ ok: true });
});
