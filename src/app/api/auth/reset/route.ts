import { z } from "zod";
import bcrypt from "bcryptjs";
import { handle, ok, fail, parseBody } from "@/lib/api";
import { sql } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

const Body = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Password must be at least 8 characters."),
  confirm: z.string(),
});

export const POST = handle(async (req) => {
  const body = await parseBody(req, Body);
  if (body.password !== body.confirm) return fail(400, "mismatch", "Passwords don't match.");

  const [row] = await sql<{ user_id: string }[]>`
    select user_id from password_resets
    where token_hash = ${sha256(body.token)} and used = false and expires_at > now()
  `;
  if (!row) return fail(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");

  const hash = await bcrypt.hash(body.password, 12);
  await sql.begin(async (tx) => {
    await tx`update users set password_hash = ${hash} where id = ${row.user_id}`;
    await tx`update password_resets set used = true where user_id = ${row.user_id}`;
  });
  return ok({ ok: true });
});
