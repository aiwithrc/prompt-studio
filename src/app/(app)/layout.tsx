import Link from "next/link";
import { auth } from "@/auth";
import { AppHeader } from "@/components/AppHeader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const email = session?.user?.email ?? "";
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={email} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-divider">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted md:px-6">
          <p>
            Created by{" "}
            <a href="https://rishabchaturvedi.com/" target="_blank" rel="noopener" className="font-bold text-lilac hover:underline">
              AiwithRC | Rishab Chaturvedi
            </a>
          </p>
          <p className="text-faint">
            Synced to your account ·{" "}
            <Link href="/settings" className="text-muted hover:text-text">
              Settings
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
