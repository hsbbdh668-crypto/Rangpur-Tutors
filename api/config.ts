// Vercel API route: /api/config — public board config + headline stats.
// Hot path: called on every page load (twice, via getConfig + getStats),
// so the queries run in parallel and the response is edge-cached briefly
// (config changes rarely; admin edits show up within a minute).
import { getDb, ensureSchema, getSetting } from "../lib/db.js";
import { json } from "../lib/posts.js";

const CACHE = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const db = getDb();
    const [notice, auto, posts, apps, chatAi] = await Promise.all([
      getSetting("notice"),
      getSetting("auto_approve"),
      db.execute(
        "SELECT kind, COUNT(*) AS c FROM posts WHERE status = 'approved' GROUP BY kind",
      ),
      db.execute("SELECT COUNT(*) AS c FROM applications"),
      getSetting("chat_ai_enabled"),
    ]);
    let guardianPosts = 0;
    let tutorPosts = 0;
    for (const r of posts.rows) {
      if (r.kind === "guardian") guardianPosts = Number(r.c);
      if (r.kind === "tutor") tutorPosts = Number(r.c);
    }
    return json(
      {
        notice,
        autoApprove: auto === "1",
        passcodeFromEnv: (process.env.ADMIN_PASSCODE ?? "").trim().length > 0,
        chatAiEnabled: chatAi !== "0",
        stats: {
          guardianPosts,
          tutorPosts,
          totalPosts: guardianPosts + tutorPosts,
          applications: Number(apps.rows[0]?.c ?? 0),
        },
      },
      200,
      CACHE,
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
