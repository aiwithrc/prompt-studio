# Prompt Studio

Write high-quality prompts for **video, image, text and LinkedIn posts**, grounded in your own saved prompts and notes.

- **RAG**: each request searches your Library (what you saved, weighted by *Worked* / *Didn't work*) and your Knowledge base (your notes, filterable by `#labels`) using vector search plus full-text search, fused with Reciprocal Rank Fusion.
- **Bring your own model**: **LM Studio** or **Ollama** running on your machine, or any cloud API key (OpenAI, Anthropic, Google Gemini, OpenRouter, Groq), or any OpenAI-compatible server.
- **Template mode** works with no model at all.
- **Feedback loop**: rate prompts *Worked* or *Didn't work*, favourite them, and future retrieval learns from it.
- Multi-user accounts with email and password, and password reset by email.

Licensed under the [MIT License](LICENSE).

> **Status: early release, not yet verified end-to-end.** The code is written against the PRD in `final design/`, but it has not yet been built or run in a real environment. See [Known limitations](#known-limitations).

---

## Quick start (Docker, recommended)

You need Docker Desktop (Windows, macOS) or Docker Engine (Linux).

```bash
git clone https://github.com/<your-user>/prompt-studio.git
cd prompt-studio
cp .env.example .env
# Edit .env: set AUTH_SECRET, KEY_ENCRYPTION_SECRET and your Gmail SMTP details (see below)
docker compose up -d --build
```

Open <http://localhost:3000>, create an account, then go to **Settings** to connect a model.

Generate the two secrets with:

```bash
openssl rand -base64 32
```

Run it once for `AUTH_SECRET` and once for `KEY_ENCRYPTION_SECRET`.

## Connect a model

### LM Studio (on your own PC)

1. In LM Studio, download a chat model, and an embedding model if you want semantic search (for example `nomic-embed-text`).
2. Open the **Developer** tab, start the local server, and turn on **Serve on local network**. Docker needs this to reach LM Studio on the host.
3. In Prompt Studio, go to **Settings → LM Studio**. The default base URL is `http://host.docker.internal:1234/v1` when the app runs in Docker. Click **Test & load models**, pick a model, then **Save & use**.
4. For embeddings, go to **Settings → Embeddings**, choose LM Studio, and enter the embedding model id.

The server makes the model calls, so **CORS is not needed**.

### Ollama

Run `ollama serve`. In Docker, set `OLLAMA_HOST=0.0.0.0` so the container can reach it. Then pick **Ollama** in Settings.

### Cloud APIs

Pick a provider in **Settings**, paste the API key, click **Test & load models**, then **Save & use**. Keys are encrypted with AES-256-GCM (`KEY_ENCRYPTION_SECRET`) and never shown again. You can also set keys in `.env` (for example `OPENAI_API_KEY`).

### Your PC from a VPS (Tailscale)

If the app runs on a VPS and LM Studio runs at home:

1. Install [Tailscale](https://tailscale.com) on the VPS and on your PC.
2. Set LM Studio to serve on the local network, as above.
3. In **Settings → LM Studio**, set the base URL to `http://<your-PC-tailscale-IP>:1234/v1`.

Only use this over your private tailnet. Do not expose LM Studio's port to the public internet.

## Password reset email (Gmail)

Use a Gmail **App Password** (Google Account → Security → 2-Step Verification → App passwords), not your normal password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
MAIL_FROM="Prompt Studio <you@gmail.com>"
```

If SMTP is not configured, reset links are printed to the server log instead of emailed.

## Deploy on a VPS

This is set up for `promptstudio.rishabchaturvedi.com`. Change the domain as needed.

1. Point a DNS **A** record for `promptstudio.rishabchaturvedi.com` at your VPS IP.
2. On the VPS, install Docker and Docker Compose, and clone the repo.
3. Create `.env` from `.env.example`. Set `APP_URL=https://promptstudio.rishabchaturvedi.com` and `APP_DOMAIN=promptstudio.rishabchaturvedi.com`.
4. Start the stack with the Caddy profile. Caddy gets the HTTPS certificate automatically.

```bash
docker compose --profile vps up -d --build
```

Ports 80 and 443 must be open in the VPS firewall. The app itself is bound to `127.0.0.1:3000` and reached through Caddy.

## Development

Requires Node.js 20.9 or later and a running Postgres 16 with pgvector.

```bash
npm install
docker compose up -d db          # Postgres with pgvector on :5432
cp .env.example .env              # DATABASE_URL should point at localhost:5432
npm run migrate                   # applies db/migrations/*.sql
npm run dev                       # http://localhost:3000
npm test                          # unit tests (Vitest)
npm run lint                      # TypeScript type check
```

## Project layout

```
db/migrations/        SQL schema (applied in order by scripts/migrate.mjs)
src/app/              Next.js routes: (auth) pages, (app) pages, api/ route handlers
src/components/       UI: GenerateView, LibraryView, KnowledgeView, EngineView, SettingsView
src/lib/
  template.ts         Template mode (deterministic, no model)
  rag.ts              Hybrid retrieval: vector + FTS, RRF, boosts
  rank.ts             RRF and boost maths
  chunk.ts            Paragraph chunker with overlap; Markdown heading prefix
  generate.ts         Generation pipeline and template fallback
  llm.ts              Provider adapters (OpenAI-compatible, Anthropic, Gemini, Ollama)
  providers.ts        Provider catalogue and per-user config
  knowledge.ts        Sources, ingest, label filters, search
  prompts.ts          Library repository, import/export
  crypto.ts           AES-256-GCM for stored API keys
  ssrf.ts             Base URL guard (blocks link-local and metadata addresses)
tests/unit/           Vitest unit tests for template, labels, chunking, ranking, parsing
```

## Design notes

- **Next.js 15 (App Router) + TypeScript**, Tailwind v4, Auth.js (credentials), Postgres 16 with pgvector, Docker Compose.
- **Retrieval** (per the PRD): top 20 by cosine similarity and top 20 by full-text rank for each corpus, merged with RRF (k = 60). Prompts then get boosts (same type ×1.3, Worked ×1.4, Didn't work ×0.6, favourite ×1.2). Passages get no boosts. Matches below cosine 0.25 are dropped.
- **Server-side model calls**, for all providers. Your LM Studio or Ollama is reached from the server, so no browser-side bridge is needed.
- **Keys** are encrypted at rest and never returned to the browser after saving.

## Known limitations

- Not yet built or run end-to-end. Run `npm run build` and `npm test` before relying on it.
- No Playwright end-to-end tests yet, and no background job queue. Ingest and re-embedding run inside the request, in batches.
- Vector search uses a sequential scan. Per-model HNSW indexes can be added later for large libraries.
- Reference images are not sent to vision models (PRD P2).
- PDF and DOCX uploads, streaming output, and email verification are not included yet (PRD P1).
- "Keep me signed in" limits session-only logins to 12 hours. The cookie itself is persistent.
- In-memory rate limiting: fine for one instance, not shared across replicas.

## Security

- Passwords are hashed with bcrypt. Sign-in and reset requests are rate limited.
- Reset links expire after 60 minutes and are single use. The database stores only a SHA-256 hash of the token.
- Retrieved context is labelled as reference material, and the model is told never to follow instructions found in it.
- Found a vulnerability? Please open a private security advisory on GitHub rather than a public issue.

## Credits

Created by [AiwithRC | Rishab Chaturvedi](https://rishabchaturvedi.com/).
