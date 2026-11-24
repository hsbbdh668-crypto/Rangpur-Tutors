// Vercel API route: /api/poster — the Facebook group posting task
// AND poster accounts, in one serverless function.
//
// The Vercel Hobby plan allows at most 12 serverless functions per
// deployment, so the whole poster surface lives here instead of three
// separate routes:
//
//   GET  /api/poster                 — the task (approved posters only)
//   POST /api/poster { action: "complete", groupId } — marks one group done
//   POST /api/poster { action: "signup", name, phone, password }
//   POST /api/poster { action: "login", phone, password }
//   POST /api/poster { action: "me" } — token required
//
// The task endpoints only work for an APPROVED poster. The poster logs
// in first and the token is sent as the `x-poster-token` header (or a
// `token` body field). A pending poster gets a 403 with their status,
// so the client can show "waiting for admin approval"; a rejected
// poster gets the same with status "rejected". Nothing about the task
// (group list, post text) leaks before approval.
//
// Passwords are stored as a scrypt hash + random salt, never plaintext
// (same params as tutor accounts: 64-byte key, 16-byte salt, hex).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ensureSchema, getDb, getSetting } from "../lib/db.js";
import { badRequest, json, num, readBody, str, validPhone } from "../lib/posts.js";
import {
  listPosterGroups,
  markPosterGroupDone,
  posterTokenFromReq,
  resolvePosterByToken,
  toPosterGroup,
  toPosterProfile,
} from "../lib/poster.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

async function createSession(posterId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await getDb().execute({
    sql: "INSERT INTO poster_sessions (token, poster_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [token, posterId, now + SESSION_TTL_MS, now],
  });
  return token;
}

async function approvedPoster(req: Request, body: Record<string, unknown>) {
  const token = posterTokenFromReq(req, body);
  if (!token) return { poster: null, error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন", status: 401 };
  const poster = await resolvePosterByToken(token);
  if (!poster) return { poster: null, error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন", status: 401 };
  if (String(poster.status) !== "approved") {
    return {
      poster: null,
      error: "অ্যাডমিন এখনো অ্যাপ্রুভ করেনি — অনুমোদনের পর গ্রুপ লিস্ট দেখতে পারবেন",
      status: 403,
    };
  }
  return { poster, error: null, status: 200 };
}

async function taskPayload() {
  const [postText, groups] = await Promise.all([
    getSetting("poster_post_text"),
    listPosterGroups(),
  ]);
  const doneCount = groups.filter((g) => g.done).length;
  return { postText, groups, doneCount, totalCount: groups.length };
}

async function completeGroup(groupId: number) {
  const groups = await listPosterGroups();
  if (!groups.some((g) => g.id === groupId)) return badRequest("গ্রুপটি পাওয়া যাচ্ছে না");
  await markPosterGroupDone(groupId);
  const fresh = await listPosterGroups();
  return json({
    ok: true,
    groups: fresh.map(toPosterGroup),
    doneCount: fresh.filter((g) => g.done).length,
    totalCount: fresh.length,
  });
}

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const gate = await approvedPoster(req, {});
    if (!gate.poster) return json({ error: gate.error }, gate.status);
    return json(await taskPayload());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
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
      if (name.length < 2) return badRequest("আপনার নাম লিখুন");
      if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
      if (password.length < 6) return badRequest("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");

      const existing = await db.execute({
        sql: "SELECT id FROM posters WHERE phone = ? LIMIT 1",
        args: [phone],
      });
      if (existing.rows[0]) {
        return badRequest("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে — লগইন করুন");
      }

      const { hash, salt } = hashPassword(password);
      const now = Date.now();
      const rs = await db.execute({
        sql: "INSERT INTO posters (name, phone, password_hash, password_salt, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
        args: [name, phone, hash, salt, now, now],
      });
      const id = Number(rs.lastInsertRowid ?? 0);
      const rows = await db.execute({
        sql: "SELECT * FROM posters WHERE id = ? LIMIT 1",
        args: [id],
      });
      const row = rows.rows[0];
      if (!row) return json({ error: "অ্যাকাউন্ট তৈরি হয়নি — আবার চেষ্টা করুন" }, 500);
      const token = await createSession(id);
      return json({ poster: toPosterProfile(row), token });
    }

    if (action === "login") {
      const phone = str(b.phone).trim();
      const password = str(b.password);
      if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
      if (!password) return badRequest("পাসওয়ার্ড লিখুন");
      const rows = await db.execute({
        sql: "SELECT * FROM posters WHERE phone = ? LIMIT 1",
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
      return json({ poster: toPosterProfile(row), token });
    }

    if (action === "me") {
      const token = posterTokenFromReq(req, b);
      if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      const row = await resolvePosterByToken(token);
      if (!row) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
      return json({ poster: toPosterProfile(row) });
    }

    if (action === "complete") {
      const gate = await approvedPoster(req, b);
      if (!gate.poster) return json({ error: gate.error }, gate.status);
      const groupId = num(b.groupId) ?? Number(b.groupId);
      if (!groupId) return badRequest("গ্রুপটি পাওয়া যাচ্ছে না");
      return completeGroup(groupId);
    }

    return badRequest("অজানা অ্যাকশন");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
