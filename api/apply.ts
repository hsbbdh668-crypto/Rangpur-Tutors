// Vercel API route: POST /api/apply — apply to / contact about a post,
// plus the guardian side of the middleman flow (no account):
//   { action: "viewApplications", postId, phone } — guardian enters the
//     phone they posted with; when it matches the post's stored phone,
//     returns that post's applications with applicant phones masked
//     except for accepted ones (full phone shown). A wrong phone returns
//     a generic error and no data.
//   { action: "setApplicationStatus", postId, phone, applicationId,
//     status: "accepted" | "rejected" } — guardian accepts/rejects an
//     application on their own post (same phone check). Accepting creates
//     the commission record: status pending, amount NULL (empty — the
//     admin fills it in; no commission rate is set).
//   (no action) — apply to a post, as before.
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str, validPhone } from "../lib/posts.js";

/** Masks a phone number: 01700123456 -> 017XX-XXX123. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}XX-XXX${digits.slice(-3)}`;
}

/** Digits only, leading 880 -> 0, so 8801712345678 matches 01712345678. */
function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhoneDigits(a);
  const nb = normalizePhoneDigits(b);
  return na.length >= 6 && na === nb;
}

const WRONG_PHONE = "মোবাইল নম্বরটি এই পোস্টের সঙ্গে মিলছে না — আবার চেষ্টা করুন";

/** Marks an application accepted and creates its commission record
    (status pending, amount NULL) unless already paid/waived. */
async function acceptApplication(id: number): Promise<void> {
  const db = getDb();
  const cur = await db.execute({
    sql: "SELECT commission_status FROM applications WHERE id = ? LIMIT 1",
    args: [id],
  });
  const status = String(cur.rows[0]?.commission_status ?? "pending");
  if (status === "paid" || status === "waived") {
    await db.execute({ sql: "UPDATE applications SET status = 'accepted' WHERE id = ?", args: [id] });
  } else {
    await db.execute({
      sql: "UPDATE applications SET status = 'accepted', commission_status = 'pending' WHERE id = ?",
      args: [id],
    });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const action = str(b.action);
    const db = getDb();

    if (action === "viewApplications") {
      const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
      const phone = str(b.phone).trim();
      if (!postId) return badRequest("পোস্ট পাওয়া যায়নি");
      if (!validPhone(phone)) return badRequest(WRONG_PHONE);
      const post = await db.execute({
        sql: "SELECT * FROM posts WHERE id = ? LIMIT 1",
        args: [postId],
      });
      const row = post.rows[0];
      if (!row || !phonesMatch(phone, String(row.phone ?? ""))) {
        return badRequest(WRONG_PHONE);
      }
      const apps = await db.execute({
        sql: "SELECT * FROM applications WHERE post_id = ? ORDER BY created_at DESC",
        args: [postId],
      });
      return json({
        postTitle: String(row.title ?? ""),
        applications: apps.rows.map((a) => ({
          id: Number(a.id),
          applicantName: String(a.applicant_name ?? ""),
          applicantRole: String(a.applicant_role),
          applicantPhoneMasked: maskPhone(String(a.applicant_phone ?? "")),
          // Full phone only once the application is accepted.
          applicantPhone:
            String(a.status) === "accepted" ? String(a.applicant_phone ?? "") : null,
          message: String(a.message ?? ""),
          status: String(a.status),
          createdAt: new Date(Number(a.created_at ?? Date.now())).toISOString(),
        })),
      });
    }

    if (action === "setApplicationStatus") {
      const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
      const applicationId =
        typeof b.applicationId === "number" ? b.applicationId : Number(b.applicationId);
      const phone = str(b.phone).trim();
      const status = str(b.status);
      if (!postId || !applicationId) return badRequest("আবেদনটি পাওয়া যাচ্ছে না");
      if (!validPhone(phone)) return badRequest(WRONG_PHONE);
      if (status !== "accepted" && status !== "rejected") {
        return badRequest("স্ট্যাটাস ঠিক নেই");
      }
      const post = await db.execute({
        sql: "SELECT * FROM posts WHERE id = ? LIMIT 1",
        args: [postId],
      });
      const row = post.rows[0];
      if (!row || !phonesMatch(phone, String(row.phone ?? ""))) {
        return badRequest(WRONG_PHONE);
      }
      const app = await db.execute({
        sql: "SELECT id, post_id FROM applications WHERE id = ? LIMIT 1",
        args: [applicationId],
      });
      const appRow = app.rows[0];
      if (!appRow || Number(appRow.post_id) !== postId) {
        return badRequest("আবেদনটি পাওয়া যাচ্ছে না");
      }
      if (status === "accepted") {
        await acceptApplication(applicationId);
      } else {
        await db.execute({
          sql: "UPDATE applications SET status = 'rejected' WHERE id = ?",
          args: [applicationId],
        });
      }
      return json({ ok: true });
    }

    const postId = typeof b.postId === "number" ? b.postId : Number(b.postId);
    const name = str(b.applicantName).trim();
    const phone = str(b.applicantPhone).trim();
    const role = str(b.applicantRole);
    if (!postId) return badRequest("পোস্ট পাওয়া যায়নি");
    if (name.length < 2) return badRequest("আপনার নাম লিখুন");
    if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
    if (role !== "tutor" && role !== "guardian") return badRequest("ভূমিকা ঠিক নেই");

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
