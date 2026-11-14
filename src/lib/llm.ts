// LLM adapters (PRD §9.4 LLMAdapter). Calls run on the server, so LM Studio/Ollama must be reachable from the
// server: localhost (same machine), host.docker.internal (Docker), or a Tailscale address (VPS -> home PC).
import type { ResolvedProvider } from "./providers";
import { normalizeBase } from "./ssrf";

export type CompleteArgs = { system: string; user: string; maxTokens?: number; json?: boolean };
export type CompleteResult = { text: string; inputTokens?: number; outputTokens?: number };

const TIMEOUT_MS = 120_000;

async function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  return readJson<T>(res);
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), redirect: "error" });
  return readJson<T>(res);
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message ?? j?.error ?? j?.message ?? text;
      if (typeof msg !== "string") msg = JSON.stringify(msg);
    } catch {
      /* keep raw text */
    }
    throw new Error(`HTTP ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

function openAiHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

/** Providers that support response_format json_object. LM Studio and custom servers are sent without it. */
const JSON_MODE_IDS = new Set(["openai", "openrouter", "groq"]);

export async function complete(p: ResolvedProvider, args: CompleteArgs): Promise<CompleteResult> {
  const maxTokens = args.maxTokens ?? 1200;
  const base = normalizeBase(p.baseUrl);

  if (p.def.kind === "openai") {
    if (!p.model) throw new Error("No model selected. Test the connection and pick a model in Settings.");
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    };
    if (args.json && JSON_MODE_IDS.has(p.def.id)) body.response_format = { type: "json_object" };
    const r = await postJson<{
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    }>(`${base}/chat/completions`, body, openAiHeaders(p.apiKey));
    return {
      text: r.choices?.[0]?.message?.content ?? "",
      inputTokens: r.usage?.prompt_tokens,
      outputTokens: r.usage?.completion_tokens,
    };
  }

  if (p.def.kind === "anthropic") {
    const r = await postJson<{
      content: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    }>(
      `${base}/v1/messages`,
      {
        model: p.model,
        max_tokens: maxTokens,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      },
      { "x-api-key": p.apiKey, "anthropic-version": "2023-06-01" },
    );
    const text = r.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return { text, inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens };
  }

  if (p.def.kind === "gemini") {
    const model = p.model.replace(/^models\//, "");
    const r = await postJson<{
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    }>(
      `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`,
      {
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(args.json ? { responseMimeType: "application/json" } : {}),
        },
      },
      {},
    );
    const text = (r.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
    return { text, inputTokens: r.usageMetadata?.promptTokenCount, outputTokens: r.usageMetadata?.candidatesTokenCount };
  }

  // Ollama
  const r = await postJson<{ message?: { content?: string }; prompt_eval_count?: number; eval_count?: number }>(
    `${base}/api/chat`,
    {
      model: p.model,
      stream: false,
      ...(args.json ? { format: "json" } : {}),
      options: { num_predict: maxTokens },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    },
    {},
  );
  return { text: r.message?.content ?? "", inputTokens: r.prompt_eval_count, outputTokens: r.eval_count };
}

/** List model ids for the "Test & load models" button. */
export async function listModels(p: { def: { kind: string }; baseUrl: string; apiKey: string }): Promise<string[]> {
  const base = normalizeBase(p.baseUrl);
  if (p.def.kind === "openai") {
    const r = await getJson<{ data?: { id: string }[] }>(`${base}/models`, openAiHeaders(p.apiKey));
    return (r.data ?? []).map((m) => m.id).sort();
  }
  if (p.def.kind === "anthropic") {
    const r = await getJson<{ data?: { id: string }[] }>(`${base}/v1/models`, {
      "x-api-key": p.apiKey,
      "anthropic-version": "2023-06-01",
    });
    return (r.data ?? []).map((m) => m.id).sort();
  }
  if (p.def.kind === "gemini") {
    const r = await getJson<{ models?: { name: string; supportedGenerationMethods?: string[] }[] }>(
      `${base}/models?key=${encodeURIComponent(p.apiKey)}`,
      {},
    );
    return (r.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort();
  }
  const r = await getJson<{ models?: { name: string }[] }>(`${base}/api/tags`, {});
  return (r.models ?? []).map((m) => m.name).sort();
}

/** Embeddings for a batch of texts. Supported on OpenAI-compatible servers (LM Studio, OpenAI, custom) and Ollama. */
export async function embedTexts(p: ResolvedProvider, model: string, texts: string[]): Promise<number[][]> {
  const base = normalizeBase(p.baseUrl);
  if (p.def.kind === "ollama") {
    const r = await postJson<{ embeddings: number[][] }>(
      `${base}/api/embed`,
      { model, input: texts },
      {},
    );
    return r.embeddings;
  }
  if (p.def.kind === "openai") {
    const r = await postJson<{ data: { index: number; embedding: number[] }[] }>(
      `${base}/embeddings`,
      { model, input: texts },
      openAiHeaders(p.apiKey),
    );
    return [...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
  throw new Error(`${p.def.label} does not offer embeddings. Choose LM Studio, Ollama or OpenAI for embeddings.`);
}
