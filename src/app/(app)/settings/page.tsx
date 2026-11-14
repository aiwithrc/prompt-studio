import { auth } from "@/auth";
import { SettingsView } from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-6">
      <p className="eyebrow">— Settings</p>
      <h1 className="display mt-3 text-[clamp(30px,5vw,56px)] leading-[0.95]">LLM providers</h1>
      <p className="mt-3 max-w-2xl text-[15px] text-muted">
        Connect LM Studio or Ollama on your own machine, or add any cloud API key. Keys are encrypted on the server and never shown again.
        Signed in as <span className="text-text">{session?.user?.email}</span>.
      </p>
      <div className="mt-8">
        <SettingsView />
      </div>
    </div>
  );
}
