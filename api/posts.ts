// Vercel API route: /api/posts
//   GET  — list approved posts (same filters as the board) / one post via ?id=
//   POST — create a guardian request or tutor offer (pending unless auto-approve)
import { getDb, ensureSchema, getSetting } from "../lib/db.js";
import {
  applicationCounts,
  badRequest,
  json,
  matchesFilters,
  num,
  readBody,
  sortPosts,
  str,
  strList,
  toPost,
  validPhone,
  type Filters,
} from "../lib/posts.js";

// Public posts never carry a full phone number: the masked form
// (017XX-XXX123) is returned instead, server-side. Admin calls go
// through /api/admin (toPost, unmasked) and still see full numbers.
/** Masks a phone number: 01700123456 -> 017XX-XXX123. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}XX-XXX${digits.slice(-3)}`;
}

function toPublicPost(row: Record<string, unknown>, applicationCount: number) {
  const post = toPost(row, applicationCount);
  return { ...post, phone: maskPhone(post.phone) };
}

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const db = getDb();
    const idParam = url.searchParams.get("id");
    if (idParam) {
      const [counts, rs] = await Promise.all([
        applicationCounts(),
        db.execute({
          sql: "SELECT * FROM posts WHERE id = ? AND status = 'approved' LIMIT 1",
          args: [Number(idParam)],
        }),
      ]);
      const row = rs.rows[0];
      return json({ post: row ? toPublicPost(row, counts.get(Number(row.id)) ?? 0) : null });
    }

    const filters: Filters = {
      kind: url.searchParams.get("kind") ?? undefined,
      query: url.searchParams.get("query") ?? undefined,
      subject: url.searchParams.get("subject") ?? undefined,
      classLevel: url.searchParams.get("classLevel") ?? undefined,
      area: url.searchParams.get("area") ?? undefined,
      mode: url.searchParams.get("mode") ?? undefined,
      medium: url.searchParams.get("medium") ?? undefined,
      gender: url.searchParams.get("gender") ?? undefined,
      minSalary: url.searchParams.get("minSalary") ? Number(url.searchParams.get("minSalary")) : undefined,
      maxSalary: url.searchParams.get("maxSalary") ? Number(url.searchParams.get("maxSalary")) : undefined,
      sort: (url.searchParams.get("sort") as Filters["sort"]) ?? "newest",
    };
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

    const [counts, rs] = await Promise.all([
      applicationCounts(),
      db.execute(
        "SELECT * FROM posts WHERE status = 'approved' ORDER BY created_at DESC",
      ),
    ]);
    let posts = rs.rows.map((r) => toPublicPost(r, counts.get(Number(r.id)) ?? 0));
    posts = posts.filter((p) => matchesFilters(p, filters));
    posts = sortPosts(posts, filters.sort);
    // Short edge cache: the board list is the same for every visitor and
    // revalidates in the background, so repeat loads skip the DB entirely.
    return json(
      { posts: posts.slice(0, limit) },
      200,
      { "cache-control": "public, s-maxage=15, stale-while-revalidate=60" },
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const kind = str(b.kind);
    const authorName = str(b.authorName).trim();
    const phone = str(b.phone).trim();
    const title = str(b.title).trim();
    const subjects = strList(b.subjects);
    const classes = strList(b.classes);
    const area = str(b.area).trim();

    if (kind !== "guardian" && kind !== "tutor") return badRequest("পোস্টের ধরন ঠিক নেই");
    if (authorName.length < 2) return badRequest("আপনার নাম লিখুন");
    if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
    if (title.length < 5) return badRequest("শিরোনাম একটু বিস্তারিত লিখুন");
    if (subjects.length === 0) return badRequest("অন্তত একটি বিষয় বেছে নিন");
    if (classes.length === 0) return badRequest("অন্তত একটি শ্রেণি বেছে নিন");
    if (area.length < 2) return badRequest("এলাকা বেছে নিন");

    const salaryMin = num(b.salaryMin);
    const salaryMax = num(b.salaryMax);
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
      return badRequest("সর্বনিম্ন বেতন সর্বোচ্চ বেতনের বেশি হতে পারে না");
    }

    const auto = (await getSetting("auto_approve")) === "1";
    const status = auto ? "approved" : "pending";
    const now = Date.now();
    const rs = await getDb().execute({
      sql: `INSERT INTO posts (kind, author_name, phone, title, subjects, classes, area,
        address_note, salary_min, salary_max, salary_negotiable, days_per_week, mode,
        medium, gender_pref, student_gender, description, institution, experience,
        availability, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        kind,
        authorName,
        phone,
        title,
        JSON.stringify(subjects.slice(0, 12)),
        JSON.stringify(classes.slice(0, 12)),
        area,
        str(b.addressNote).slice(0, 160),
        salaryMin,
        salaryMax,
        b.salaryNegotiable === true ? 1 : 0,
        num(b.daysPerWeek),
        ["home", "online", "both"].includes(str(b.mode)) ? str(b.mode) : "home",
        ["bangla", "english", "both"].includes(str(b.medium)) ? str(b.medium) : "bangla",
        ["any", "male", "female"].includes(str(b.genderPref)) ? str(b.genderPref) : "any",
        ["any", "male", "female"].includes(str(b.studentGender)) ? str(b.studentGender) : "any",
        str(b.description).slice(0, 1200),
        str(b.institution).slice(0, 120),
        str(b.experience).slice(0, 200),
        str(b.availability).slice(0, 200),
        status,
        now,
        now,
      ],
    });
    return json({ id: Number(rs.lastInsertRowid ?? 0), status });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
