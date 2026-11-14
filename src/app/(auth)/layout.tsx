import Link from "next/link";

// Split screen (AUTH-09): brand panel on the left, form on the right.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <aside className="hero-gradient relative flex flex-col justify-between gap-10 p-8 md:p-14">
        <div className="max-w-xl">
          <p className="eyebrow !text-white/80">Human-led · AI-powered</p>
          <h1 className="display mt-6 text-balance text-[clamp(30px,3.6vw,52px)] leading-[1.02] text-white">
            Prompts that remember what worked
          </h1>
          <p className="mt-6 max-w-md text-pretty text-[15px] leading-relaxed text-white/85">
            Write video, image, text and LinkedIn prompts grounded in your own library and notes. Rate what works and
            the next prompt gets better.
          </p>
        </div>
        <p className="text-sm text-white/80">
          Created by{" "}
          <a
            href="https://rishabchaturvedi.com/"
            target="_blank"
            rel="noopener"
            className="font-bold text-white underline underline-offset-4"
          >
            AiwithRC | Rishab Chaturvedi
          </a>
        </p>
      </aside>
      <main className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm sm:max-w-md">{children}</div>
      </main>
      <footer className="col-span-full border-t border-divider px-6 py-4 text-center text-xs text-faint md:hidden">
        <Link href="https://rishabchaturvedi.com/" target="_blank" rel="noopener">
          AiwithRC | Rishab Chaturvedi
        </Link>
      </footer>
    </div>
  );
}
