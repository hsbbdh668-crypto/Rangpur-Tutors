// Vercel API route: /api/config — public board config + headline stats.
import { getDb, ensureSchema, getSetting } from "../lib/db";
import { json } from "../lib/posts";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const notice = await getSetting("notice");
    const auto = await getSetting("auto_approve");
    const db = getDb();
    const posts = await db.execute(
      "SELECT kind, COUNT(*) AS c FROM posts WHERE status = 'approved' GROUP BY kind",
    );
    const apps = await db.execute("SELECT COUNT(*) AS c FROM applications");
    let guardianPosts = 0;
    let tutorPosts = 0;
    for (const r of posts.rows) {
      if (r.kind === "guardian") guardianPosts = Number(r.c);
      if (r.kind === "tutor") tutorPosts = Number(r.c);
    }
    return json({
      notice,
      autoApprove: auto === "1",
      passcodeFromEnv: (process.env.ADMIN_PASSCODE ?? "").trim().length > 0,
      chatAiEnabled: (await getSetting("chat_ai_enabled")) !== "0",
      stats: {
        guardianPosts,
        tutorPosts,
        totalPosts: guardianPosts + tutorPosts,
        applications: Number(apps.rows[0]?.c ?? 0),
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
