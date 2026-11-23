// Vercel API route: POST /api/report — report a post for admin review.
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str } from "../lib/posts.js";

const REASONS = ["wrong_info", "spam", "inappropriate", "fraud", "other"];

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
    const reason = str(b.reason);
    if (!postId) return badRequest("পোস্ট পাওয়া যায়নি");
    if (!REASONS.includes(reason)) return badRequest("রিপোর্টের কারণ ঠিক নেই");
    const rs = await getDb().execute({
      sql: "INSERT INTO reports (post_id, reporter_name, reason, details, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [postId, str(b.reporterName).slice(0, 60), reason, str(b.details).slice(0, 500), Date.now()],
    });
    return json({ id: Number(rs.lastInsertRowid ?? 0) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
