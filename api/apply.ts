// Vercel API route: POST /api/apply — apply to / contact about a post.
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str, validPhone } from "../lib/posts.js";

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
    const name = str(b.applicantName).trim();
    const phone = str(b.applicantPhone).trim();
    const role = str(b.applicantRole);
    if (!postId) return badRequest("পোস্ট পাওয়া যায়নি");
    if (name.length < 2) return badRequest("আপনার নাম লিখুন");
    if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
    if (role !== "tutor" && role !== "guardian") return badRequest("ভূমিকা ঠিক নেই");

    const db = getDb();
    const post = await db.execute({
      sql: "SELECT id FROM posts WHERE id = ? AND status = 'approved' LIMIT 1",
      args: [postId],
    });
    if (!post.rows[0]) return badRequest("এই পোস্টটি আর পাওয়া যাচ্ছে না");

    const rs = await db.execute({
      sql: "INSERT INTO applications (post_id, applicant_name, applicant_phone, applicant_role, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [postId, name, phone, role, str(b.message).slice(0, 600), Date.now()],
    });
    return json({ id: Number(rs.lastInsertRowid ?? 0) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
