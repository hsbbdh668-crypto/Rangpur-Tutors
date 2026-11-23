// Vercel API route: POST /api/tutors — tutor accounts.
//
// Mirrors the Hatch actions tutorSignup / tutorLogin / tutorMe /
// tutorUpdateProfile in server/src/actions.ts (same validation, same
// shapes, same Bengali error messages) so the client works unchanged
// on both backends.
//
//   POST /api/tutors  { action: "signup", name, phone, password,
//                       university, department, subjects, classes,
//                       areas, experience?, fees?, gender, photoUrl? }
//   POST /api/tutors  { action: "login", phone, password }
//   POST /api/tutors  { action: "me" }        — token required
//   POST /api/tutors  { action: "update", …profile fields } — token required
//   POST /api/tutors  { action: "myApplications" } — token required
//                       (sent + received applications; applicant phones
//                       are masked, e.g. 017XX-XXX123, except the FULL
//                       number once the application is accepted — both
//                       ways: sent shows the guardian's full phone, and
//                       received shows the applicant's full phone)
//   POST /api/tutors  { action: "setApplicationStatus", applicationId,
//                       status: "contacted"|"accepted"|"rejected" }
//                       — token required; only on the tutor's own posts.
//                       Accepting creates the commission record
//                       (status pending, amount NULL).
//
// The session token is sent as the `x-tutor-token` request header, or
// as the `token` body field (the header wins when both are present).
// signup/login return { tutor, token }; me/update return { tutor }.
// Passwords are stored as a scrypt hash + random salt, never plaintext.
// No email/SMS verification; no guardian accounts (guardians keep
// posting without an account, exactly as before).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str, strList, validPhone } from "../lib/posts.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const expected = Buffer.from(String(hash), "hex");
    const actual = scryptSync(password, String(salt), 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function parseList(v: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(v ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Public tutor profile — never includes password_hash / password_salt. */
function toTutorProfile(row: Row) {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    university: String(row.university ?? ""),
    department: String(row.department ?? ""),
    subjects: parseList(row.subjects),
    classes: parseList(row.classes),
    areas: parseList(row.areas),
    experience: String(row.experience ?? ""),
    fees: String(row.fees ?? ""),
    gender: (row.gender as "male" | "female" | "other") ?? "other",
    photoUrl: row.photo_url == null ? null : String(row.photo_url),
    verified: Number(row.verified ?? 0) === 1,
    createdAt: new Date(Number(row.created_at ?? Date.now())).toISOString(),
    updatedAt: new Date(Number(row.updated_at ?? Date.now())).toISOString(),
  };
}

async function createSession(tutorId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await getDb().execute({
    sql: "INSERT INTO tutor_sessions (token, tutor_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [token, tutorId, now + SESSION_TTL_MS, now],
  });
  return token;
}

/** Resolves a token to its tutor row, or null when missing/expired. */
async function resolveTutor(token: string): Promise<Row | null> {
  const db = getDb();
  const sessions = await db.execute({
    sql: "SELECT * FROM tutor_sessions WHERE token = ? LIMIT 1",
    args: [token],
  });
  const session = sessions.rows[0];
  if (!session) return null;
  if (Number(session.expires_at) <= Date.now()) {
    await db.execute({
      sql: "DELETE FROM tutor_sessions WHERE id = ?",
      args: [Number(session.id)],
    });
    return null;
  }
  const rows = await db.execute({
    sql: "SELECT * FROM tutors WHERE id = ? LIMIT 1",
    args: [Number(session.tutor_id)],
  });
  return rows.rows[0] ?? null;
}

/** Masks a phone number for tutor-facing views: 01700123456 -> 017XX-XXX456.
    Full applicant numbers are never sent to tutors until the middleman
    rules land; only this masked form leaves the server. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}XX-XXX${digits.slice(-3)}`;
}

/** Token from the `x-tutor-token` header, falling back to body `token`. */
function readToken(req: Request, body: Record<string, unknown>): string {
  const fromHeader = req.headers.get("x-tutor-token")?.trim();
  if (fromHeader) return fromHeader;
  return str(body.token).trim();
}

function validGender(v: string): v is "male" | "female" | "other" {
  return v === "male" || v === "female" || v === "other";
}

function cleanList(v: unknown, maxLen: number): string[] {
  return strList(v)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= maxLen)
    .slice(0, 12);
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const action = str(b.action);
    const db = getDb();

    if (action === "signup") {
      const name = str(b.name).trim();
      const phone = str(b.phone).trim();
      const password = str(b.password);
      const university = str(b.university).trim();
      const department = str(b.department).trim();
      const subjects = cleanList(b.subjects, 40);
      const classes = cleanList(b.classes, 40);
      const areas = cleanList(b.areas, 80);
      const experience = str(b.experience).trim().slice(0, 200);
      const fees = str(b.fees).trim().slice(0, 120);
      const gender = str(b.gender);
      const photoUrlRaw = str(b.photoUrl).trim();
      const photoUrl = photoUrlRaw.length > 0 ? photoUrlRaw.slice(0, 500) : null;

      if (name.length < 2) return badRequest("আপনার নাম লিখুন");
      if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
      if (password.length < 6) return badRequest("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      if (university.length < 2) return badRequest("বিশ্ববিদ্যালয়ের নাম লিখুন");
      if (department.length < 2) return badRequest("বিভাগের নাম লিখুন");
      if (subjects.length < 1) return badRequest("অন্তত একটি বিষয় বেছে নিন");
      if (classes.length < 1) return badRequest("অন্তত একটি শ্রেণি বেছে নিন");
      if (areas.length < 1) return badRequest("অন্তত একটি এলাকা বেছে নিন");
      if (!validGender(gender)) return badRequest("লিঙ্গ ঠিক নেই");

      const existing = await db.execute({
        sql: "SELECT id FROM tutors WHERE phone = ? LIMIT 1",
        args: [phone],
      });
      if (existing.rows[0]) {
        return badRequest("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে — লগইন করুন");
      }

      const { hash, salt } = hashPassword(password);
      const now = Date.now();
      const rs = await db.execute({
        sql: "INSERT INTO tutors (name, phone, password_hash, password_salt, university, department, subjects, classes, areas, experience, fees, gender, photo_url, verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        args: [
          name,
          phone,
          hash,
          salt,
          university,
          department,
          JSON.stringify(subjects),
          JSON.stringify(classes),
          JSON.stringify(areas),
          experience,
          fees,
          gender,
          photoUrl,
          now,
          now,
        ],
      });
      const id = Number(rs.lastInsertRowid ?? 0);
      const rows = await db.execute({
        sql: "SELECT * FROM tutors WHERE id = ? LIMIT 1",
        args: [id],
      });
      const row = rows.rows[0];
      if (!row) return json({ error: "অ্যাকাউন্ট তৈরি হয়নি — আবার চেষ্টা করুন" }, 500);
      const token = await createSession(id);
      return json({ tutor: toTutorProfile(row), token });
    }

    if (action === "login") {
      const phone = str(b.phone).trim();
      const password = str(b.password);
      if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
      if (!password) return badRequest("পাসওয়ার্ড লিখুন");
      const rows = await db.execute({
        sql: "SELECT * FROM tutors WHERE phone = ? LIMIT 1",
        args: [phone],
      });
      const row = rows.rows[0];
      if (
        !row ||
        !verifyPassword(password, String(row.password_hash), String(row.password_salt))
      ) {
        return badRequest("মোবাইল নম্বর বা পাসওয়ার্ড ভুল — আবার চেষ্টা করুন");
      }
      const token = await createSession(Number(row.id));
      return json({ tutor: toTutorProfile(row), token });
    }

    if (action === "me") {
      const token = readToken(req, b);
      if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const row = await resolveTutor(token);
      if (!row) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      return json({ tutor: toTutorProfile(row) });
    }

    if (action === "update") {
      const token = readToken(req, b);
      if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const row = await resolveTutor(token);
      if (!row) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const tutorId = Number(row.id);

      // Only the fields present in the body are changed.
      const sets: string[] = [];
      const args: (string | number | null)[] = [];
      const set = (col: string, value: string | number | null) => {
        sets.push(`${col} = ?`);
        args.push(value);
      };
      if (b.name !== undefined) {
        const name = str(b.name).trim();
        if (name.length < 2) return badRequest("আপনার নাম লিখুন");
        set("name", name);
      }
      if (b.phone !== undefined) {
        const phone = str(b.phone).trim();
        if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
        if (phone !== String(row.phone)) {
          const clash = await db.execute({
            sql: "SELECT id FROM tutors WHERE phone = ? LIMIT 1",
            args: [phone],
          });
          if (clash.rows[0]) return badRequest("এই মোবাইল নম্বরটি অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে");
        }
        set("phone", phone);
      }
      if (b.university !== undefined) {
        const university = str(b.university).trim();
        if (university.length < 2) return badRequest("বিশ্ববিদ্যালয়ের নাম লিখুন");
        set("university", university);
      }
      if (b.department !== undefined) {
        const department = str(b.department).trim();
        if (department.length < 2) return badRequest("বিভাগের নাম লিখুন");
        set("department", department);
      }
      if (b.subjects !== undefined) {
        const subjects = cleanList(b.subjects, 40);
        if (subjects.length < 1) return badRequest("অন্তত একটি বিষয় বেছে নিন");
        set("subjects", JSON.stringify(subjects));
      }
      if (b.classes !== undefined) {
        const classes = cleanList(b.classes, 40);
        if (classes.length < 1) return badRequest("অন্তত একটি শ্রেণি বেছে নিন");
        set("classes", JSON.stringify(classes));
      }
      if (b.areas !== undefined) {
        const areas = cleanList(b.areas, 80);
        if (areas.length < 1) return badRequest("অন্তত একটি এলাকা বেছে নিন");
        set("areas", JSON.stringify(areas));
      }
      if (b.experience !== undefined) set("experience", str(b.experience).trim().slice(0, 200));
      if (b.fees !== undefined) set("fees", str(b.fees).trim().slice(0, 120));
      if (b.gender !== undefined) {
        const gender = str(b.gender);
        if (!validGender(gender)) return badRequest("লিঙ্গ ঠিক নেই");
        set("gender", gender);
      }
      if (b.photoUrl !== undefined) {
        const photoUrlRaw = str(b.photoUrl).trim();
        set("photo_url", photoUrlRaw.length > 0 ? photoUrlRaw.slice(0, 500) : null);
      }
      if (sets.length > 0) {
        sets.push("updated_at = ?");
        args.push(Date.now());
        await db.execute({
          sql: `UPDATE tutors SET ${sets.join(", ")} WHERE id = ?`,
          args: [...args, tutorId],
        });
      }
      const fresh = await db.execute({
        sql: "SELECT * FROM tutors WHERE id = ? LIMIT 1",
        args: [tutorId],
      });
      const freshRow = fresh.rows[0];
      if (!freshRow) return json({ error: "প্রোফাইল পাওয়া যাচ্ছে না" }, 500);
      return json({ tutor: toTutorProfile(freshRow) });
    }

    if (action === "myApplications") {
      const token = readToken(req, b);
      if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const row = await resolveTutor(token);
      if (!row) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const tutorPhone = String(row.phone);
      const appRows = await db.execute({
        sql: "SELECT * FROM applications ORDER BY created_at DESC",
      });
      const postRows = await db.execute({ sql: "SELECT id, title, phone FROM posts" });
      const byId = new Map(
        postRows.rows.map((p) => [
          Number(p.id),
          { title: String(p.title ?? ""), phone: String(p.phone ?? "") },
        ]),
      );
      const toSent = (a: Row) => {
        const postPhone = byId.get(Number(a.post_id))?.phone ?? "";
        return {
          id: Number(a.id),
          postId: Number(a.post_id),
          postTitle: byId.get(Number(a.post_id))?.title ?? "",
          postAuthorPhoneMasked: maskPhone(postPhone),
          // The guardian's full phone is revealed only once this
          // application is accepted.
          postAuthorPhone: a.status === "accepted" ? postPhone : null,
          message: String(a.message ?? ""),
          status: a.status as "new" | "contacted" | "accepted" | "rejected",
          createdAt: new Date(Number(a.created_at ?? Date.now())).toISOString(),
        };
      };
      const toReceived = (a: Row) => ({
        id: Number(a.id),
        postId: Number(a.post_id),
        postTitle: byId.get(Number(a.post_id))?.title ?? "",
        applicantName: String(a.applicant_name ?? ""),
        applicantPhoneMasked: maskPhone(String(a.applicant_phone ?? "")),
        // The applicant's full phone is revealed only once this
        // application is accepted.
        applicantPhone:
          a.status === "accepted" ? String(a.applicant_phone ?? "") : null,
        message: String(a.message ?? ""),
        status: a.status as "new" | "contacted" | "accepted" | "rejected",
        createdAt: new Date(Number(a.created_at ?? Date.now())).toISOString(),
      });
      return json({
        sent: appRows.rows
          .filter((a) => String(a.applicant_phone) === tutorPhone)
          .map(toSent),
        received: appRows.rows
          .filter((a) => byId.get(Number(a.post_id))?.phone === tutorPhone)
          .map(toReceived),
      });
    }

    if (action === "setApplicationStatus") {
      const token = readToken(req, b);
      if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const row = await resolveTutor(token);
      if (!row) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const tutorPhone = String(row.phone);
      const status = str(b.status);
      const applicationId =
        typeof b.applicationId === "number" ? b.applicationId : Number(b.applicationId);
      if (!applicationId) return badRequest("আবেদনটি পাওয়া যাচ্ছে না");
      if (status !== "contacted" && status !== "accepted" && status !== "rejected") {
        return badRequest("স্ট্যাটাস ঠিক নেই");
      }
      const app = await db.execute({
        sql: "SELECT * FROM applications WHERE id = ? LIMIT 1",
        args: [applicationId],
      });
      const appRow = app.rows[0];
      if (!appRow) return badRequest("আবেদনটি পাওয়া যাচ্ছে না");
      const post = await db.execute({
        sql: "SELECT phone FROM posts WHERE id = ? LIMIT 1",
        args: [Number(appRow.post_id)],
      });
      const postRow = post.rows[0];
      // Only applications on the tutor's own posts (phone-linked).
      if (!postRow || String(postRow.phone ?? "") !== tutorPhone) {
        return badRequest("এই আবেদনটি আপনার পোস্টের নয়");
      }
      if (status === "accepted") {
        // Accepting creates the commission record: status pending,
        // amount NULL (empty — the admin fills it in).
        const cur = String(appRow.commission_status ?? "pending");
        if (cur === "paid" || cur === "waived") {
          await db.execute({
            sql: "UPDATE applications SET status = 'accepted' WHERE id = ?",
            args: [applicationId],
          });
        } else {
          await db.execute({
            sql: "UPDATE applications SET status = 'accepted', commission_status = 'pending' WHERE id = ?",
            args: [applicationId],
          });
        }
      } else {
        await db.execute({
          sql: "UPDATE applications SET status = ? WHERE id = ?",
          args: [status, applicationId],
        });
      }
      return json({ ok: true });
    }

    return badRequest("অজানা অ্যাকশন");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
