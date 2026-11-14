"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Field, Notice, PasswordInput, TextInput } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState(params.get("error") ? "Email or password is incorrect." : "");
  const [notice] = useState(params.get("reset") ? "Password updated. Sign in with your new password." : "");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      remember: String(remember),
      redirect: false,
    });
    setBusy(false);
    if (!res || res.error) {
      setError("Email or password is incorrect.");
      return;
    }
    router.replace("/generate");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="display text-[30px]">Sign in</h2>
        <p className="mt-2 text-sm text-muted">Welcome back. Pick up where you left off.</p>
      </div>
      <Notice tone="success">{notice}</Notice>
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" required autoComplete="email" placeholder="your@emailaddress.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" required autoComplete="current-password" placeholder="At least 8 characters" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#ff8a4c]" />
        Keep me signed in
      </label>
      <Notice tone="error">{error}</Notice>
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="font-semibold text-lilac hover:underline">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-semibold text-lilac hover:underline">
          Create an account
        </Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
