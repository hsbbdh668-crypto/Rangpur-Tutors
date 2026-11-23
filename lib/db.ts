// Hosted-database layer for the Vercel deployment of Baraka Tutors.
//
// Uses Turso (libSQL) — a hosted SQLite-compatible database — through
// @libsql/client, so the exact same tables as `server/src/schema.ts`
// (Drizzle) are used in production. Connection details come ONLY from
// environment variables (set in Vercel → Settings → Environment Variables):
//
//   TURSO_DATABASE_URL   e.g. libsql://barakatutors-<you>.turso.io
//   TURSO_AUTH_TOKEN     database auth token from the Turso dashboard
//   DATABASE_URL         fallback alias for TURSO_DATABASE_URL
//
// No credentials are ever hard-coded here.

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      "Database is not configured: set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) in the environment.",
    );
  }
  client = createClient(authToken ? { url, authToken } : { url });
  return client;
}

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use (same shape as server/src/schema.ts). */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = getDb();
    schemaReady = (async () => {
      await db.batch(
        [
          `CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            author_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            title TEXT NOT NULL,
            subjects TEXT NOT NULL DEFAULT '[]',
            classes TEXT NOT NULL DEFAULT '[]',
            area TEXT NOT NULL,
            address_note TEXT NOT NULL DEFAULT '',
            salary_min INTEGER,
            salary_max INTEGER,
            salary_negotiable INTEGER NOT NULL DEFAULT 0,
            days_per_week INTEGER,
            mode TEXT NOT NULL DEFAULT 'home',
            medium TEXT NOT NULL DEFAULT 'bangla',
            gender_pref TEXT NOT NULL DEFAULT 'any',
            student_gender TEXT NOT NULL DEFAULT 'any',
            description TEXT NOT NULL DEFAULT '',
            institution TEXT NOT NULL DEFAULT '',
            experience TEXT NOT NULL DEFAULT '',
            availability TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            featured INTEGER NOT NULL DEFAULT 0,
            verified INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            applicant_name TEXT NOT NULL,
            applicant_phone TEXT NOT NULL,
            applicant_role TEXT NOT NULL DEFAULT 'tutor',
            message TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            commission_amount INTEGER,
            commission_status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            reporter_name TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS saved_searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            filters_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
          )`,
          `CREATE TABLE IF NOT EXISTS chat_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_name TEXT NOT NULL DEFAULT '',
            visitor_phone TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'ai',
            needs_admin INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            sender TEXT NOT NULL DEFAULT 'visitor',
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS tutors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            university TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            subjects TEXT NOT NULL DEFAULT '[]',
            classes TEXT NOT NULL DEFAULT '[]',
            areas TEXT NOT NULL DEFAULT '[]',
            experience TEXT NOT NULL DEFAULT '',
            fees TEXT NOT NULL DEFAULT '',
            gender TEXT NOT NULL DEFAULT 'other',
            photo_url TEXT,
            verified INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS tutor_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            tutor_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )`,
        ],
        "write",
      );
      // NOTE: the commission columns live in the CREATE TABLE above, so
      // no ALTER backfill is needed (the old loop always failed on a
      // live DB where the columns exist — two wasted round trips per
      // cold start).
    })();
  }
  return schemaReady;
}

export async function getSetting(key: string): Promise<string> {
  await ensureSchema();
  const rs = await getDb().execute({
    sql: "SELECT value FROM settings WHERE key = ? LIMIT 1",
    args: [key],
  });
  const row = rs.rows[0];
  return row ? String(row.value ?? "") : "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema();
  await getDb().execute({
    sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [key, value],
  });
}

/**
 * Effective admin passcode for the Vercel deployment: the ADMIN_PASSCODE
 * environment variable wins; the panel-saved passcode is the fallback.
 * There is no hard-coded default.
 */
export async function expectedPasscode(): Promise<string> {
  const fromEnv = (process.env.ADMIN_PASSCODE ?? process.env.ADMIN_PASSWORD ?? "").trim();
  if (fromEnv) return fromEnv;
  return getSetting("admin_passcode");
}

export async function checkPasscode(passcode: string): Promise<boolean> {
  const expected = await expectedPasscode();
  return expected.length > 0 && passcode === expected;
}
