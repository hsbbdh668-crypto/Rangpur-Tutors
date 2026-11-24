// Vercel API route: POST /api/posters — poster accounts for the
// Facebook group posting flow (/poster).
//
// Mirrors the Hatch actions posterSignup / posterLogin / posterMe in
// server/src/actions.ts (same validation, same shapes, same Bengali
// error messages) so the client works unchanged on both backends.
//
//   POST /api/posters  { action: "signup", name, phone, password }
//   POST /api/posters  { action: "login", phone, password }
//   POST /api/posters  { action: "me" } — token required
//
// The session token is sent as the `x-poster-token` request header, or
// as the `token` body field (the header wins when both are present).
// signup/login return { poster, token }; me returns { poster }.
// Passwords are stored as a scrypt hash + random salt, never plaintext.
//
// Approval flow (Jubayar, 2026-11-24): a poster signs up and CAN log
// in, but sees NO task until an admin approves the account — the
// /api/poster task endpoints return 403 while status is 'pending' (or
// 'rejected'), and the client shows "waiting for admin approval".
// Approving / rejecting happens in the admin panel (POST /api/admin).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str, validPhone } from "../lib/posts.js";
import {
  posterTokenFromReq,
  resolvePosterByToken,
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

    return badRequest("অজানা অ্যাকশন");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
