# Baraka Tutors — বারাকা টিউটরস

রংপুরের গার্ডিয়ান ও টিউটরদের টিউশন বোর্ড: গার্ডিয়ানরা টিউশন রিকোয়েস্ট পোস্ট করেন, টিউটররা টিউশন অফার পোস্ট করেন — সার্চ/ফিল্টার, আবেদন, রিপোর্ট, ফেভারিট, অ্যাডমিন প্যানেল আর AI লাইভ-চ্যাটসহ।

**Live site: [barakatutors.vercel.app](https://barakatutors.vercel.app)** — Vercel project name is `barakatutors` (no space, no hyphen).

## Features

- 🏠 Guardian tuition requests + 🎓 tutor offers, with admin approval flow (optional auto-approve)
- 🔎 Search & filters: subject, class, Rangpur area, mode (home/online), medium, salary range, sorting; saved searches
- ✉️ Applications/contact requests, ⚠️ post reports, ❤️ favourites
- 🛠️ Full admin panel: approve/reject/close posts, featured pins, verified-tutor badges, edit/delete, applications & reports management, notice banner, settings
- 💬 AI live chat on every page (Bangla/English): the assistant answers questions about posting, subjects, classes, areas and fees; money/verification topics are escalated to the admin, who can take over any chat from the admin chat inbox and turn the AI on/off
- 🌐 Bilingual UI — Bangla by default, one-tap English; fully responsive on mobile, laptop and PC
- 🎨 Logo #4 (open book + graduation cap + teal swoosh) with a matching deep-purple & teal theme

## Deploying to Vercel (barakatutors.vercel.app)

1. **Push this repo to GitHub.**
2. **Create the hosted database** (free): sign up at [turso.tech](https://turso.tech), create a database (e.g. named `barakatutors`), and copy its `libsql://…` URL and auth token. The tables are created automatically on first API call — the schema matches `server/src/schema.ts`.
3. **Import the repo in Vercel** and set the **project name to `barakatutors`** (no space, no hyphen) so the address becomes `barakatutors.vercel.app`. `vercel.json` already sets the framework, build command and SPA rewrites — don't override them.
4. **Set environment variables** in Vercel → Project → Settings → Environment Variables (see `.env.example`):
   - `ADMIN_PASSCODE` — the admin panel passcode (required; it is **not** in the code)
   - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` — the hosted database
   - `GROQ_API_KEY` — free key from [console.groq.com](https://console.groq.com) (no card), enables AI replies in the Vercel live chat. Primary model **GPT-OSS 120B** (human-like replies, ~1,000 free requests/day); when that limit is hit the chat automatically falls back to **GPT-OSS 20B** so it never stops. `AI_API_URL`/`AI_MODEL`/`AI_FALLBACK_MODEL` can override the endpoint/models
5. **Deploy.** Every later push to the GitHub repo auto-deploys.

## Project layout

| Path | What it is |
| --- | --- |
| `client/` | React + Tailwind front end (Bangla default, English switcher) |
| `api/` | Real REST API routes for Vercel (Node runtime): `posts`, `config`, `apply`, `report`, `favorites`, `saved-searches`, `chat`, `admin` |
| `lib/` | Hosted-DB layer (`@libsql/client` → Turso) + shared post/filter logic used by the API routes |
| `server/` | The same features as typed actions for the Muse-hosted version; shares the Drizzle schema in `server/src/schema.ts` |
| `drizzle/` | SQL migrations for the Muse-hosted database |
| `vercel.json` | Vercel project config — name `barakatutors`, Vite build, `/api` + SPA rewrites |

The admin passcode is resolved in this order: `ADMIN_PASSCODE` env var → passcode saved from the admin panel (settings table). There is no hard-coded default.

## Local development

```bash
bun install
cp .env.example .env   # fill in ADMIN_PASSCODE + TURSO_* values
bun run build          # builds the Muse-hosted client + server bundle
```

## Notes

- Phone numbers are shown on post cards so guardians and tutors can call each other directly — confirm salary and schedule before committing.
- The AI assistant never handles money or verification decisions; those chats are flagged in the admin inbox (`needs admin`).
