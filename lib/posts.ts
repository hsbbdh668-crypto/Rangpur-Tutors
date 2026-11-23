// Shared post mapping + filtering for the Vercel API routes.
// Mirrors the logic in server/src/actions.ts so both backends behave alike.

import { getDb, ensureSchema } from "./db.js";

export interface Post {
  id: number;
  kind: "guardian" | "tutor";
  authorName: string;
  phone: string;
  title: string;
  subjects: string[];
  classes: string[];
  area: string;
  addressNote: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNegotiable: boolean;
  daysPerWeek: number | null;
  mode: "home" | "online" | "both";
  medium: "bangla" | "english" | "both";
  genderPref: "any" | "male" | "female";
  studentGender: "any" | "male" | "female";
  description: string;
  institution: string;
  experience: string;
  availability: string;
  status: "pending" | "approved" | "rejected" | "closed";
  featured: boolean;
  verified: boolean;
  applicationCount: number;
  createdAt: string;
}

type Row = Record<string, unknown>;

function parseList(json: unknown): string[] {
  try {
    const v: unknown = JSON.parse(String(json ?? "[]"));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function toPost(row: Row, applicationCount: number): Post {
  return {
    id: Number(row.id),
    kind: row.kind as Post["kind"],
    authorName: String(row.author_name ?? ""),
    phone: String(row.phone ?? ""),
    title: String(row.title ?? ""),
    subjects: parseList(row.subjects),
    classes: parseList(row.classes),
    area: String(row.area ?? ""),
    addressNote: String(row.address_note ?? ""),
    salaryMin: numOrNull(row.salary_min),
    salaryMax: numOrNull(row.salary_max),
    salaryNegotiable: Number(row.salary_negotiable ?? 0) === 1,
    daysPerWeek: numOrNull(row.days_per_week),
    mode: (row.mode as Post["mode"]) ?? "home",
    medium: (row.medium as Post["medium"]) ?? "bangla",
    genderPref: (row.gender_pref as Post["genderPref"]) ?? "any",
    studentGender: (row.student_gender as Post["studentGender"]) ?? "any",
    description: String(row.description ?? ""),
    institution: String(row.institution ?? ""),
    experience: String(row.experience ?? ""),
    availability: String(row.availability ?? ""),
    status: (row.status as Post["status"]) ?? "pending",
    featured: Number(row.featured ?? 0) === 1,
    verified: Number(row.verified ?? 0) === 1,
    applicationCount,
    createdAt: new Date(Number(row.created_at ?? Date.now())).toISOString(),
  };
}

export async function applicationCounts(): Promise<Map<number, number>> {
  await ensureSchema();
  const rs = await getDb().execute("SELECT post_id, COUNT(*) AS c FROM applications GROUP BY post_id");
  const map = new Map<number, number>();
  for (const r of rs.rows) map.set(Number(r.post_id), Number(r.c));
  return map;
}

export interface Filters {
  kind?: string;
  query?: string;
  subject?: string;
  classLevel?: string;
  area?: string;
  mode?: string;
  medium?: string;
  gender?: string;
  minSalary?: number;
  maxSalary?: number;
  sort?: "newest" | "salary_high" | "salary_low";
}

export function matchesFilters(p: Post, f: Filters): boolean {
  if (f.kind && p.kind !== f.kind) return false;
  if (f.subject && !p.subjects.includes(f.subject)) return false;
  if (f.classLevel && !p.classes.includes(f.classLevel)) return false;
  if (f.area && p.area !== f.area) return false;
  if (f.mode && p.mode !== "both" && p.mode !== f.mode) return false;
  if (f.medium && p.medium !== "both" && p.medium !== f.medium) return false;
  // Teacher gender: a post matches when its genderPref is "any" (guardian
  // accepts either gender) or equals the selected gender. This covers
  // both cases — a guardian's preference and a tutor's own gender, both
  // stored in gender_pref.
  if (f.gender && p.genderPref !== "any" && p.genderPref !== f.gender) return false;
  if (f.minSalary != null) {
    const hi = p.salaryMax ?? p.salaryMin;
    if (!p.salaryNegotiable && (hi == null || hi < f.minSalary)) return false;
  }
  if (f.maxSalary != null) {
    const lo = p.salaryMin ?? p.salaryMax;
    if (!p.salaryNegotiable && (lo == null || lo > f.maxSalary)) return false;
  }
  if (f.query) {
    const q = f.query.trim().toLowerCase();
    if (q) {
      const hay = [p.title, p.authorName, p.area, p.description, p.institution, ...p.subjects, ...p.classes]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  return true;
}

export function sortPosts(posts: Post[], sort: Filters["sort"]): Post[] {
  return posts.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (sort === "salary_high") {
      return (b.salaryMax ?? b.salaryMin ?? -1) - (a.salaryMax ?? a.salaryMin ?? -1);
    }
    if (sort === "salary_low") {
      return (
        (a.salaryMin ?? a.salaryMax ?? Number.MAX_SAFE_INTEGER) -
        (b.salaryMin ?? b.salaryMax ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** JSON request/response helpers for Vercel Node functions. */
export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(headers ?? {}) },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await req.json();
    return v != null && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export const PHONE_RE = /^[0-9+\-\s]+$/;

export function validPhone(v: string): boolean {
  const t = v.trim();
  return t.length >= 6 && t.length <= 20 && PHONE_RE.test(t);
}
