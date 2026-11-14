import { auth } from "@/auth";
import { Hero } from "@/components/Hero";
import { GenerateView, type InitialPrompt } from "@/components/GenerateView";
import { getPrompt } from "@/lib/prompts";
import { getProfile } from "@/lib/settings";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const { open } = await searchParams;
  const [profile, stats, opened] = await Promise.all([
    getProfile(userId),
    getStats(userId),
    open && /^[0-9a-f-]{36}$/i.test(open) ? getPrompt(userId, open) : Promise.resolve(null),
  ]);

  // Kid-safe is stored inside `fields` (PRD §8: "detail fields + kidSafe").
  const { kidSafe: storedKidSafe, ...details } = (opened?.fields ?? {}) as Record<string, string | boolean>;

  const initial: InitialPrompt | null = opened
    ? {
        id: opened.id,
        type: opened.type,
        mode: opened.mode,
        prompt: opened.prompt,
        negative: opened.negative,
        width: opened.width,
        height: opened.height,
        frames: opened.frames,
        idea: opened.idea,
        refDesc: opened.ref_desc,
        fields: details as Record<string, string>,
        kidSafe: typeof storedKidSafe === "boolean" ? storedKidSafe : profile.kidSafeDefault,
        collection: opened.collection,
        tags: opened.tags,
        favourite: opened.favourite,
        rating: opened.rating,
        uses: opened.uses,
        provider: opened.provider,
        model: opened.model,
      }
    : null;

  return (
    <>
      <Hero
        eyebrow="Generate"
        title="Write a prompt"
        subtitle="Describe what you want. Prompt Studio pulls relevant past prompts and your notes, then writes a ready-to-paste prompt."
        stats={[
          { label: "Saved prompts", value: stats.saved },
          { label: "Worked rate", value: stats.workedRate },
          { label: "Knowledge passages", value: stats.passages },
        ]}
      />
      <GenerateView
        initial={initial}
        defaults={{
          mode: profile.defaultMode,
          topK: profile.topK,
          showScores: profile.showScores,
          kidSafe: profile.kidSafeDefault,
        }}
      />
    </>
  );
}
