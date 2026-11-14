import type { ReactNode } from "react";

export type Stat = { label: string; value: ReactNode };

// Gradient hero band (PRD §7): eyebrow, uppercase title, subtitle and three stat tiles.
export function Hero({
  eyebrow,
  title,
  subtitle,
  stats,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats: Stat[];
}) {
  return (
    <section className="hero-gradient">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 md:px-6 md:py-14 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="eyebrow !text-white/80">{eyebrow}</p>
          <h1 className="display mt-3 text-[clamp(30px,5.5vw,64px)] leading-[0.95] text-white">{title}</h1>
          <p className="mt-4 max-w-xl text-[15px] text-white/85">{subtitle}</p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/20 bg-black/15 p-4">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">{s.label}</dt>
              <dd className="display mt-2 text-[26px] text-white">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
