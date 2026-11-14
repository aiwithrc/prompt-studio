"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, Field, Notice, TextInput } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setError("");
    try {
      const r = await api<{ message: string }>("/api/auth/forgot", { method: "POST", json: { email } });
      setMessage(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="display text-[30px]">Reset password</h2>
        <p className="mt-2 text-sm text-muted">Enter your email and we'll send a link to choose a new password.</p>
      </div>
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" required autoComplete="email" placeholder="your@emailaddress.com" />
      </Field>
      <Notice>{message}</Notice>
      <Notice tone="error">{error}</Notice>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="text-sm font-semibold text-lilac hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
