# Data Plan

Core content is user-generated (posts, applications, reports, favourites, saved searches, live-chat conversations) and stored through the artifact's own actions — no external content feeds.

Deployment sources added for the Vercel version (project name `barakatutors`, live at barakatutors.vercel.app):

- Hosted database: Turso / libSQL (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` env vars) used by the REST API routes in `api/` via `lib/db.ts`; schema mirrors `server/src/schema.ts`. No credentials in code.
- Admin passcode: `ADMIN_PASSCODE` environment variable (Vercel → Settings → Environment Variables), falling back to the panel-saved passcode in the settings table. No hard-coded default.
- AI live chat: on the Muse-hosted version, replies come from `ctx.inference` inside the chat actions; on Vercel, `api/chat.ts` calls Groq (free, OpenAI-compatible) with `GROQ_API_KEY` — primary model `openai/gpt-oss-120b`, automatic fallback to `openai/gpt-oss-20b` on rate limit (`AI_API_URL` / `AI_MODEL` / `AI_FALLBACK_MODEL` can override). Sensitive topics (money, verification) are always escalated to the admin instead of being answered by the AI.
- Deploy/config files: `vercel.json`, `.gitignore`, `.env.example`, `README.md` at the repo root.
