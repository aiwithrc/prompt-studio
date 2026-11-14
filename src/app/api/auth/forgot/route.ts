import { z } from "zod";
import { handle, ok, fail, parseBody } from "@/lib/api";
import { sql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({ email: z.string().trim().toLowerCase().email() });
const GENERIC = "If an account exists, we've sent a reset link.";

export const POST = handle(async (req) => {
  const { email } = await parseBody(req, Body);
  const limit = rateLimit(`forgot:${email}`, 5, 60_000);
  if (!limit.ok) return fail(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfter} seconds.`);

  const [user] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
  if (user) {
    const token = randomToken(32);
    await sql`delete from password_resets where user_id = ${user.id}`;
    await sql`
      insert into password_resets (token_hash, user_id, expires_at)
      values (${sha256(token)}, ${user.id}, now() + interval '60 minutes')
    `;
    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    try {
      await sendMail(
        email,
        "Reset your Prompt Studio password",
        `Use this link to set a new password. It expires in 60 minutes.\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      );
    } catch (e) {
      // Never reveal mail failures to the requester (no account enumeration). Log without the token.
      console.error(`[auth] reset email failed: ${(e instanceof Error ? e.message : "unknown").slice(0, 200)}`);
    }
  }
  // Same answer whether or not the account exists (no account enumeration).
  return ok({ message: GENERIC });
});
