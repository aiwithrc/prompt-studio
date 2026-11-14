"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/generate", label: "Generate" },
  { href: "/library", label: "Library" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/engine", label: "Engine" },
];

export function AppHeader({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-header/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link
          href="/settings"
          aria-label="Open settings"
          title="Settings: LLM providers, embeddings, preferences"
          className="touch flex size-11 items-center justify-center rounded-full border border-border-strong hover:bg-white/5"
        >
          <span aria-hidden className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 bg-text" />
            <span className="block h-0.5 w-5 bg-text" />
            <span className="block h-0.5 w-5 bg-text" />
          </span>
        </Link>

        <Link href="/generate" className="flex items-center gap-3">
          <span className="hero-gradient display flex size-9 items-center justify-center rounded-lg text-[13px] text-[#120a2a]">RC</span>
          <span className="leading-tight">
            <span className="block text-[10px] font-bold tracking-[0.18em] text-muted">RISHAB CHATURVEDI</span>
            <span className="display block text-[15px] text-text">Prompt Studio</span>
          </span>
        </Link>

        <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`touch inline-flex items-center rounded-full px-4 text-sm font-bold ${
                  active ? "bg-accent text-[#1b0b33]" : "text-muted hover:text-text"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <form
          role="search"
          className="ml-auto min-w-0 flex-1 md:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/library?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <label htmlFor="global-search" className="sr-only">
            Search prompts
          </label>
          <input
            id="global-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search prompts, ideas, tags"
            className="touch w-full rounded-full border border-border bg-surface-deep px-4 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden max-w-[180px] truncate text-muted lg:inline" title={email}>
            {email}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="touch rounded-full border border-border-strong px-4 font-bold text-text hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
