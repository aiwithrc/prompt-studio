import { handle, requireUser } from "@/lib/api";
import { exportPrompts } from "@/lib/prompts";

export const GET = handle(async () => {
  const user = await requireUser();
  const data = await exportPrompts(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="prompt-studio-${stamp}.json"`,
    },
  });
});
