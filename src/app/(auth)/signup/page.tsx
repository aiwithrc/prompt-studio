"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { api, ApiError } from "@/lib/client";
import { Button, Field, Notice, PasswordInput, TextInput } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await api("/api/auth/signup", { method: "POST", json: { email, password, confirm } });
      const res = await signIn("credentials", { email, password, remember: "true", redirect: false });
      if (res?.error) {
        setError("Account created. Sign in to continue.");
        return router.replace("/login");
      }
      router.replace("/generate");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="display text-[30px]">Create account</h2>
        <p className="mt-2 text-sm text-muted">Your prompts, knowledge and settings stay in your account.</p>
      </div>
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" required autoComplete="email" placeholder="your@emailaddress.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" required autoComplete="new-password" placeholder="Re-enter your password" />
      </Field>
      <Notice tone="error">{error}</Notice>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </Button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-lilac hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
