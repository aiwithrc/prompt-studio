// Route-handler helpers: JSON responses, error shape from PRD §10, and session lookup.
import { NextResponse } from "next/server";
import type { z, ZodTypeAny } from "zod";
import { auth } from "@/auth";

export function ok<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Returns the signed-in user id, or throws HttpError(401). Use inside try/catch with handle(). */
export async function requireUser(): Promise<{ id: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "unauthorized", "Sign in to continue.");
  return { id: session.user.id, email: session.user.email ?? "" };
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input.";
    throw new HttpError(400, "validation", msg);
  }
  return parsed.data;
}

// Route params vary per file (id, provider, section), so the context type is kept loose here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteCtx = { params: Promise<any> };

/** Wrap a handler: converts HttpError to the PRD error shape and logs anything unexpected (truncated). */
export function handle(fn: (req: Request, ctx: RouteCtx) => Promise<Response>) {
  return async (req: Request, ctx: RouteCtx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.code, e.message);
      const msg = e instanceof Error ? e.message : "Unexpected error";
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}: ${msg.slice(0, 200)}`);
      return fail(500, "internal", "Something went wrong. Check the server log.");
    }
  };
}
