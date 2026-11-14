import { auth } from "@/auth";
import { Hero } from "@/components/Hero";
import { LibraryView } from "@/components/LibraryView";
import { collectionsAndTags, listPrompts, serialise } from "@/lib/prompts";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; rating?: string; fav?: string; collection?: string; tag?: string; sort?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const sp = await searchParams;
  const filters = {
    q: sp.q ?? "",
    type: sp.type ?? "all",
    rating: sp.rating ?? "any",
    fav: sp.fav === "1",
    collection: sp.collection ?? "",
    tag: sp.tag ?? "",
    sort: sp.sort ?? "recent",
  };
  const [{ items, nextCursor }, meta, stats] = await Promise.all([
    listPrompts(userId, { ...filters, rating: filters.rating === "any" ? undefined : filters.rating, type: filters.type, offset: 0, limit: 30 }),
    collectionsAndTags(userId),
    getStats(userId),
  ]);

  return (
    <>
      <Hero
        eyebrow="Library"
        title="Your prompts"
        subtitle="Every prompt you saved, with what worked. Filter by type or rating, open one back into Generate, or copy it."
        stats={[
          { label: "Saved prompts", value: stats.saved },
          { label: "Worked rate", value: stats.workedRate },
          { label: "Knowledge passages", value: stats.passages },
        ]}
      />
      <LibraryView
        initialItems={items.map(serialise)}
        initialCursor={nextCursor}
        initialFilters={filters}
        collections={meta.collections.map((c) => c.collection)}
        tags={meta.tags.map((t) => t.tag)}
      />
    </>
  );
}
