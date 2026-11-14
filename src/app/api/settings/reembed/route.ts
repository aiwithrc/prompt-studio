import { handle, ok, requireUser } from "@/lib/api";
import { sql, toVector } from "@/lib/db";
import { embedTexts } from "@/lib/llm";
import { getEmbedder } from "@/lib/settings";

const BATCH = 32;
const MAX_PER_CALL = 256; // keep each request short; the UI calls again until remaining = 0

// Re-embed prompts and passages that were embedded with a different model (SET-02). Call until remaining = 0.
export const POST = handle(async () => {
  const user = await requireUser();
  const emb = await getEmbedder(user.id);
  if (!emb) return ok({ done: 0, remaining: 0, message: "No embedding model is set." });

  let done = 0;
  while (done < MAX_PER_CALL) {
    const prompts = await sql<{ id: string; text: string }[]>`
      select id, type || ': ' || idea || E'\n' || prompt || E'\ntags: ' || array_to_string(tags, ', ') || E'\ncollection: ' || collection as text
      from prompts where user_id = ${user.id} and (embedding is null or embedding_model <> ${emb.model})
      limit ${BATCH}
    `;
    const chunks = await sql<{ id: string; content: string }[]>`
      select id, content from knowledge_chunks
      where user_id = ${user.id} and (embedding is null or embedding_model <> ${emb.model})
      limit ${BATCH}
    `;
    if (prompts.length === 0 && chunks.length === 0) break;
    const items = [...prompts.map((p) => ({ kind: "p" as const, id: p.id, text: p.text })), ...chunks.map((c) => ({ kind: "c" as const, id: c.id, text: c.content }))];
    const vectors = await embedTexts(emb.provider, emb.model, items.map((i) => i.text.slice(0, 8000)));
    await sql.begin(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const v = toVector(vectors[i]);
        if (items[i].kind === "p") {
          await tx`update prompts set embedding = ${v}::vector, embedding_model = ${emb.model} where id = ${items[i].id}`;
        } else {
          await tx`update knowledge_chunks set embedding = ${v}::vector, embedding_model = ${emb.model} where id = ${items[i].id}`;
        }
      }
    });
    done += items.length;
  }

  const [p] = await sql<{ n: number }[]>`select count(*)::int as n from prompts where user_id = ${user.id} and (embedding is null or embedding_model <> ${emb.model})`;
  const [c] = await sql<{ n: number }[]>`select count(*)::int as n from knowledge_chunks where user_id = ${user.id} and (embedding is null or embedding_model <> ${emb.model})`;
  return ok({ done, remaining: p.n + c.n });
});
