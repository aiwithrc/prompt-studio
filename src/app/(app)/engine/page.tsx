import { auth } from "@/auth";
import { Hero } from "@/components/Hero";
import { EngineView } from "@/components/EngineView";
import { DEFAULT_ENGINE } from "@/lib/constants";
import { customisedSections, getEngine } from "@/lib/settings";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function EnginePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const [sections, custom, stats] = await Promise.all([getEngine(userId), customisedSections(userId), getStats(userId)]);
  return (
    <>
      <Hero
        eyebrow="Prompt engine"
        title="System instructions"
        subtitle="These rules tell the model how to write. Edit a section to change its behaviour. Reset returns it to the built-in default."
        stats={[
          { label: "Sections", value: 5 },
          { label: "Customised", value: custom.size },
          { label: "Saved prompts", value: stats.saved },
        ]}
      />
      <EngineView initialSections={sections} defaults={DEFAULT_ENGINE} initialCustomised={[...custom]} />
    </>
  );
}
