import { auth } from "@/auth";
import { Hero } from "@/components/Hero";
import { KnowledgeView } from "@/components/KnowledgeView";
import { listSources } from "@/lib/knowledge";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const [list, stats] = await Promise.all([listSources(userId, ""), getStats(userId)]);
  return (
    <>
      <Hero
        eyebrow="Knowledge"
        title="Your notes"
        subtitle="Add brand guides, product facts and research. Prompt Studio finds the right passages and uses them when it writes a prompt."
        stats={[
          { label: "Sources", value: list.totals.sources },
          { label: "Labels", value: list.labels.length },
          { label: "Passages", value: stats.passages },
        ]}
      />
      <KnowledgeView initial={{ sources: list.sources, labels: list.labels }} />
    </>
  );
}
