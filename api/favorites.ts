// Vercel API route: /api/favorites
//   GET  — bookmarked (approved) posts + their ids
//   POST — toggle a bookmark { postId }
import { getDb, ensureSchema } from "../lib/db.js";
import { applicationCounts, badRequest, json, readBody, toPost } from "../lib/posts.js";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const db = getDb();
    const favs = await db.execute("SELECT post_id FROM favorites ORDER BY id DESC");
    const ids = favs.rows.map((r) => Number(r.post_id));
    if (ids.length === 0) return json({ posts: [], favoriteIds: [] });
    const counts = await applicationCounts();
    const rows = await db.execute("SELECT * FROM posts WHERE status = 'approved'");
    const byId = new Map(rows.rows.map((r) => [Number(r.id), toPost(r, counts.get(Number(r.id)) ?? 0)]));
    const posts = ids.map((id) => byId.get(id)).filter(Boolean);
    return json({ posts, favoriteIds: ids });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
    if (!postId) return badRequest("পোস্ট পাওয়া যায়নি");
    const db = getDb();
    const existing = await db.execute({
      sql: "SELECT id FROM favorites WHERE post_id = ? LIMIT 1",
      args: [postId],
    });
    if (existing.rows[0]) {
      await db.execute({ sql: "DELETE FROM favorites WHERE post_id = ?", args: [postId] });
      return json({ favorite: false });
    }
    await db.execute({
      sql: "INSERT INTO favorites (post_id, created_at) VALUES (?, ?)",
      args: [postId, Date.now()],
    });
    return json({ favorite: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
