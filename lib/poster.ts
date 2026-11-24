// Shared poster (Facebook group posting, /poster) helpers for the
// Vercel API routes. Mirrors the tutor-account helpers in api/tutors.ts
// (same session shape, same 30-day tokens).

import { getDb } from "./db.js";

export type PosterStatus = "pending" | "approved" | "rejected";

export interface PosterGroup {
  id: number;
  name: string;
  url: string;
  done: boolean;
  doneAt: string | null;
  sortOrder: number;
}

export interface PosterProfile {
  id: number;
  name: string;
  phone: string;
  status: PosterStatus;
  createdAt: string;
}

type Row = Record<string, unknown>;

export function toPosterGroup(row: Row): PosterGroup {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    url: String(row.url ?? ""),
    done: Number(row.done ?? 0) === 1,
    doneAt:
      row.done_at == null ? null : new Date(Number(row.done_at)).toISOString(),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function toPosterProfile(row: Row): PosterProfile {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    status: (row.status as PosterStatus) ?? "pending",
    createdAt: new Date(Number(row.created_at ?? Date.now())).toISOString(),
  };
}

/** Lists all poster groups in display order (sort_order, then id). */
export async function listPosterGroups(): Promise<PosterGroup[]> {
  const rs = await getDb().execute(
    "SELECT * FROM poster_groups ORDER BY sort_order ASC, id ASC",
  );
  return rs.rows.map(toPosterGroup);
}

/** Resolves a poster session token to its poster row, or null when
    missing/expired (expired sessions are deleted). */
export async function resolvePosterByToken(token: string): Promise<Row | null> {
  const db = getDb();
  const sessions = await db.execute({
    sql: "SELECT * FROM poster_sessions WHERE token = ? LIMIT 1",
    args: [token],
  });
  const session = sessions.rows[0];
  if (!session) return null;
  if (Number(session.expires_at) <= Date.now()) {
    await db.execute({
      sql: "DELETE FROM poster_sessions WHERE id = ?",
      args: [Number(session.id)],
    });
    return null;
  }
  const rows = await db.execute({
    sql: "SELECT * FROM posters WHERE id = ? LIMIT 1",
    args: [Number(session.poster_id)],
  });
  return rows.rows[0] ?? null;
}

/** Token from the `x-poster-token` header, falling back to body `token`. */
export function posterTokenFromReq(
  req: Request,
  body: Record<string, unknown>,
): string {
  const fromHeader = req.headers.get("x-poster-token")?.trim();
  if (fromHeader) return fromHeader;
  return typeof body.token === "string" ? body.token.trim() : "";
}

/** Marks one group done (idempotent — already-done stays done). */
export async function markPosterGroupDone(id: number): Promise<boolean> {
  const rs = await getDb().execute({
    sql: "UPDATE poster_groups SET done = 1, done_at = ? WHERE id = ?",
    args: [Date.now(), id],
  });
  return (rs.rowsAffected ?? 0) > 0;
}
