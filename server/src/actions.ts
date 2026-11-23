// Actions for Baraka Tutors (barakatutors.vercel.app).
//
// Public board: approved posts only. New posts land as 'pending' and appear
// after an admin approves them, unless the admin turns auto-approve on.
//
// Admin passcode — environment variable first (Vercel-ready):
//   1. `ADMIN_PASSCODE` env var (set in Vercel → Project → Settings →
//      Environment Variables, or in a local `.env` file). This is the
//      production source of truth and is never stored in code.
//   2. The passcode saved from the admin panel (settings table) — used
//      when no env var is set, e.g. local development in this workspace.
// There is deliberately NO hard-coded default passcode in the code.
//
// On Vercel the same handlers are exposed as REST API routes under `api/`
// (see `api/_lib.ts`) backed by the hosted database in `DATABASE_URL`
// (Turso / libSQL — the Drizzle schema in `server/src/schema.ts` is shared).

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { Privileged } from "@space/privileged";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Reads the ADMIN_PASSCODE environment variable through the privileged
 * host handler (see src/privileged.ts) — the portable action bundle never
 * touches the process global itself. Returns "" when no env var is set.
 */
async function envPasscode(ctx: Ctx): Promise<string> {
  try {
    const res = await ctx.executePrivileged(Privileged.adminPasscodeFromEnv, {});
    return res.passcode.trim();
  } catch {
    return "";
  }
}

const ADMIN_PRIVILEGED = [Privileged.adminPasscodeFromEnv] as const;

const kindEnum = z.enum(["guardian", "tutor"]);
const modeEnum = z.enum(["home", "online", "both"]);
const mediumEnum = z.enum(["bangla", "english", "both"]);
const genderEnum = z.enum(["any", "male", "female"]);
const postStatusEnum = z.enum(["pending", "approved", "rejected", "closed"]);

const phoneSchema = z
  .string()
  .trim()
  .min(6, "সঠিক মোবাইল নম্বর দিন")
  .max(20)
  .regex(/^[0-9+\-\s]+$/, "সঠিক মোবাইল নম্বর দিন");

const postShape = z.object({
  id: z.number(),
  kind: kindEnum,
  authorName: z.string(),
  phone: z.string(),
  title: z.string(),
  subjects: z.array(z.string()),
  classes: z.array(z.string()),
  area: z.string(),
  addressNote: z.string(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryNegotiable: z.boolean(),
  daysPerWeek: z.number().nullable(),
  mode: modeEnum,
  medium: mediumEnum,
  genderPref: genderEnum,
  studentGender: genderEnum,
  description: z.string(),
  institution: z.string(),
  experience: z.string(),
  availability: z.string(),
  status: postStatusEnum,
  featured: z.boolean(),
  verified: z.boolean(),
  applicationCount: z.number(),
  createdAt: z.string(),
});

type PostRow = typeof schema.posts.$inferSelect;

function parseList(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toPost(row: PostRow, applicationCount: number): z.infer<typeof postShape> {
  return {
    id: row.id,
    kind: row.kind,
    authorName: row.authorName,
    phone: row.phone,
    title: row.title,
    subjects: parseList(row.subjects),
    classes: parseList(row.classes),
    area: row.area,
    addressNote: row.addressNote,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryNegotiable: row.salaryNegotiable === 1,
    daysPerWeek: row.daysPerWeek,
    mode: row.mode,
    medium: row.medium,
    genderPref: row.genderPref,
    studentGender: row.studentGender,
    description: row.description,
    institution: row.institution,
    experience: row.experience,
    availability: row.availability,
    status: row.status,
    featured: row.featured === 1,
    verified: row.verified === 1,
    applicationCount,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getSetting(ctx: Ctx, key: string): Promise<string> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return rows[0]?.value ?? "";
}

async function setSetting(ctx: Ctx, key: string, value: string): Promise<void> {
  const db = ctx.db<typeof schema>();
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/**
 * Resolves the effective admin passcode: the ADMIN_PASSCODE env var wins
 * when set (production on Vercel); otherwise the panel-saved passcode from
 * the settings table is used. Returns "" when neither is configured.
 */
async function expectedPasscode(ctx: Ctx): Promise<string> {
  const fromEnv = await envPasscode(ctx);
  if (fromEnv) return fromEnv;
  return getSetting(ctx, "admin_passcode");
}

async function checkPasscode(ctx: Ctx, passcode: string): Promise<void> {
  const expected = await expectedPasscode(ctx);
  if (!expected || passcode !== expected) {
    throw new Error("ভুল পাসকোড — আবার চেষ্টা করুন");
  }
}

/* ---------------- live chat (AI assistant + admin inbox) ---------------- */

const chatMessageShape = z.object({
  id: z.number(),
  conversationId: z.number(),
  sender: z.enum(["visitor", "ai", "admin"]),
  body: z.string(),
  createdAt: z.string(),
});

const chatConversationShape = z.object({
  id: z.number(),
  visitorName: z.string(),
  visitorPhone: z.string(),
  mode: z.enum(["ai", "admin"]),
  needsAdmin: z.boolean(),
  lastMessage: z.string(),
  messageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type ChatMessageRow = typeof schema.chatMessages.$inferSelect;
type ChatConversationRow = typeof schema.chatConversations.$inferSelect;

function toChatMessage(row: ChatMessageRow): z.infer<typeof chatMessageShape> {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender: row.sender,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

async function chatAiEnabled(ctx: Ctx): Promise<boolean> {
  return (await getSetting(ctx, "chat_ai_enabled")) !== "0";
}

/**
 * Sensitive topics the AI must never decide itself — paying/sending money,
 * refunds, fraud claims, and getting a post or tutor approved/verified.
 * General questions about fees ("how much salary?") are NOT sensitive:
 * the AI answers those from the post itself.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /বিকাশ|নগদ|রকেট|উপায়/, // mobile-money wallets
  /টাকা\s*(পাঠা|দেব|দিব|পাঠিয়ে|ফেরত|চাই|লাগবে\s*আগে)|আগাম\s*টাকা|অগ্রিম/,
  /পেমেন্ট\s*(কর|করব|দেব)|রিফান্ড|ফেরত\s*দিন|প্রতারণা|প্রতারক|ধোঁকা/,
  /ভেরিফাই\s*(করে\s*দিন|করুন|চাই)|ভেরিফিকেশন\s*(করে|চাই)|অনুমোদন\s*(করে\s*দিন|করুন|চাই)/,
  /\bbkash\b|\bnagad\b|\brocket\b|\brefund/i,
  /\b(send|sent|pay|paid|payment|transfer)\b[^.?!]{0,40}\b(money|taka|tk|৳)\b/i,
  /\b(money|taka)\b[^.?!]{0,40}\b(send|sent|pay|paid|transfer|refund)\b/i,
  /\b(scam|fraud|cheat(ed)?|stole|advance payment)\b/i,
  /\b(verify|approve)\b[^.?!]{0,30}\b(me|my|post|account)\b/i,
];

function isSensitiveTopic(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

function chatWelcome(lang: "bn" | "en"): string {
  return lang === "en"
    ? "Hello! I'm the Baraka Tutors assistant. Ask me how to post a tuition, find a tutor, or anything about tuition in Rangpur."
    : "আসসালামু আলাইকুম! আমি বারাকা টিউটরসের সহকারী। টিউশন পোস্ট করা, টিউটর খোঁজা বা রংপুরের টিউশন নিয়ে যেকোনো প্রশ্ন করুন।";
}

function chatEscalation(lang: "bn" | "en"): string {
  return lang === "en"
    ? "This is about money or verification, so I can't decide it myself — I've passed your message to the admin, who will reply here. Please don't send money to anyone in the meantime."
    : "এটা টাকা-পয়সা বা ভেরিফিকেশনের বিষয়, তাই আমি নিজে সিদ্ধান্ত নিতে পারি না — আপনার বার্তাটি অ্যাডমিনের কাছে পাঠিয়ে দিয়েছি, তিনি এখানেই রিপ্লাই করবেন। এর মধ্যে অনুগ্রহ করে কাউকে টাকা পাঠাবেন না।";
}

function chatFallback(lang: "bn" | "en"): string {
  return lang === "en"
    ? "Sorry, I couldn't answer just now. I've flagged this chat for the admin, who will reply here."
    : "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারলাম না। চ্যাটটি অ্যাডমিনের জন্য চিহ্নিত করে রেখেছি — তিনি এখানেই রিপ্লাই করবেন।";
}

const CHAT_SYSTEM_PROMPT = `You are the friendly assistant of "Baraka Tutors" (বারাকা টিউটরস), a tuition board for Rangpur, Bangladesh, where guardians post tuition requests and tutors post tuition offers.

How to talk:
- Talk like a warm, helpful human friend — never robotic, never canned or repetitive, never start replies with the same phrase twice. Always reply in the SAME language and script the visitor just used, and stay entirely in that script: Bangla script (বাংলা) gets a reply written only in Bangla script, Roman Bengali / Banglish (Bengali written in English letters, e.g. "amar ekta tutor lagbe") gets a reply written ONLY in Latin letters with no Bangla-script characters at all, in the same Roman Bengali style, for example "Post tab-e giye Guardian select koro, tarpor naam, mobile number, subject ar area likhe Submit chap dao" — do not answer in plain English when the visitor wrote Banglish. Never force English when the visitor wrote Bengali in either script, and never mix scripts in one reply.
- Remember everything said earlier in this conversation and build on it — refer back to what the visitor already told you (their class, subject, area, whether they are a guardian or a tutor) instead of asking again.
- Be organised: answer the question first, then add the one helpful next step. When something important is missing (e.g. which class, which area of Rangpur, home or online), ask ONE friendly follow-up question, the way a person would.
- Keep most replies conversational (2–6 sentences). Use a short list only when it genuinely helps. Plain text, no markdown tables.

What you know:
- How the site works: the Board tab lists approved posts — guardians looking for tutors and tutors offering tuition. Anyone can post for free from the "Post" tab (choose guardian or tutor, fill name, mobile number, title, subjects, classes, area, salary); new posts appear after admin approval unless auto-approve is on. To contact a poster, tap Call on the card, or open the post and send an application with your name and mobile number. The heart button saves a post to Favourites. Posts can be reported from the detail view.
- Subjects include Mathematics, Higher Mathematics, English, Bangla, Physics, Chemistry, Biology, General Science, ICT, Accounting, Finance, Economics, Arabic and more; classes run from Play–Nursery to Class 12 (HSC) and admission preparation. Areas cover all of Rangpur: Lalbag, Dhap, Shapla Chattar, Medical Mor, College Para, Kamalkachna, Mahiganj, Tajhat, Haragach, Mithapukur, Badarganj, Pirganj, Pirgachha, Kaunia, Gangachara, Taraganj — plus online anywhere.
- Salary/fees are set by the poster on each post and are often negotiable; you may explain typical ranges only in general terms and always point to the salary shown on the specific post. Never promise a specific fee for a specific person.
- Verification: a "Verified tutor" badge is given only by the admin after checking; you cannot verify, approve or reject anyone or any post.

Hard limits:
- NEVER ask for or handle money, payments, bKash/Nagad numbers, passwords or OTPs. If the visitor raises paying/sending money, refunds, fraud, or asks you to verify/approve them, do not decide — say the admin will handle it (the system escalates automatically).
- If you don't know something specific (a particular post's phone number, whether a post is approved), say so honestly and warmly, and suggest checking the Board or waiting for the admin here.`;

async function generateAiReply(
  ctx: Ctx,
  history: { sender: string; body: string }[],
  lang: "bn" | "en",
): Promise<string> {
  const transcript = history
    .slice(-12)
    .map((m) => `${m.sender === "visitor" ? "Visitor" : m.sender === "ai" ? "Assistant" : "Admin"}: ${m.body}`)
    .join("\n");
  const reply = await ctx.inference.complete(
    `Conversation so far:\n${transcript}\n\nWrite the assistant's next reply. The visitor's language preference is ${lang === "en" ? "English" : "Bangla"} — match the visitor's last message language if it differs.`,
    { system: CHAT_SYSTEM_PROMPT, schema: z.string(), timeout_secs: 60 },
  );
  const text = reply.trim();
  return text.length > 0 ? text.slice(0, 2000) : chatFallback(lang);
}

async function loadConversation(
  ctx: Ctx,
  id: number,
): Promise<ChatConversationRow | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.chatConversations)
    .where(eq(schema.chatConversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function loadMessages(
  ctx: Ctx,
  conversationId: number,
): Promise<z.infer<typeof chatMessageShape>[]> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.conversationId, conversationId))
    .orderBy(schema.chatMessages.id);
  return rows.map(toChatMessage);
}

async function applicationCounts(ctx: Ctx): Promise<Map<number, number>> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.applications);
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.postId, (map.get(r.postId) ?? 0) + 1);
  return map;
}

const filtersShape = z.object({
  kind: kindEnum.optional(),
  query: z.string().max(120).optional(),
  subject: z.string().max(60).optional(),
  classLevel: z.string().max(60).optional(),
  area: z.string().max(80).optional(),
  mode: modeEnum.optional(),
  medium: mediumEnum.optional(),
  minSalary: z.number().int().min(0).max(1000000).optional(),
  maxSalary: z.number().int().min(0).max(1000000).optional(),
  sort: z.enum(["newest", "salary_high", "salary_low"]).default("newest"),
});

type Filters = z.infer<typeof filtersShape>;

function matchesFilters(p: z.infer<typeof postShape>, f: Filters): boolean {
  if (f.kind && p.kind !== f.kind) return false;
  if (f.subject && !p.subjects.includes(f.subject)) return false;
  if (f.classLevel && !p.classes.includes(f.classLevel)) return false;
  if (f.area && p.area !== f.area) return false;
  if (f.mode && p.mode !== "both" && p.mode !== f.mode) return false;
  if (f.medium && p.medium !== "both" && p.medium !== f.medium) return false;
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
      const hay = [
        p.title,
        p.authorName,
        p.area,
        p.description,
        p.institution,
        ...p.subjects,
        ...p.classes,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  return true;
}

const okResponse = z.object({ ok: z.literal(true) });

export const Actions = {
  getConfig: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Returns public board configuration: notice banner text and whether new posts auto-approve.",
    request: z.object({}),
    response: z.object({
      notice: z.string(),
      autoApprove: z.boolean(),
      passcodeFromEnv: z.boolean(),
      chatAiEnabled: z.boolean(),
    }),
    async handler(ctx) {
      const notice = await getSetting(ctx, "notice");
      const auto = await getSetting(ctx, "auto_approve");
      const chatAi = await getSetting(ctx, "chat_ai_enabled");
      return {
        notice,
        autoApprove: auto === "1",
        passcodeFromEnv: (await envPasscode(ctx)).length > 0,
        chatAiEnabled: chatAi !== "0",
      };
    },
  }),

  getStats: defineAction({
    description: "Returns public board counts: approved guardian requests, tutor offers, total applications.",
    request: z.object({}),
    response: z.object({
      guardianPosts: z.number(),
      tutorPosts: z.number(),
      totalPosts: z.number(),
      applications: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.status, "approved"));
      const apps = await db.select({ id: schema.applications.id }).from(schema.applications);
      const guardianPosts = rows.filter((r) => r.kind === "guardian").length;
      const tutorPosts = rows.filter((r) => r.kind === "tutor").length;
      return {
        guardianPosts,
        tutorPosts,
        totalPosts: rows.length,
        applications: apps.length,
      };
    },
  }),

  listPosts: defineAction({
    description: "Lists approved posts for the public board, with search and filters (kind, subject, class, area, mode, medium, salary).",
    request: filtersShape.extend({ limit: z.number().int().positive().max(200).default(100) }),
    response: z.object({ posts: z.array(postShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.status, "approved"))
        .orderBy(desc(schema.posts.createdAt));
      const counts = await applicationCounts(ctx);
      let posts = rows.map((r) => toPost(r, counts.get(r.id) ?? 0));
      posts = posts.filter((p) => matchesFilters(p, args));
      posts.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (args.sort === "salary_high") {
          return (b.salaryMax ?? b.salaryMin ?? -1) - (a.salaryMax ?? a.salaryMin ?? -1);
        }
        if (args.sort === "salary_low") {
          return (a.salaryMin ?? a.salaryMax ?? Number.MAX_SAFE_INTEGER) -
            (b.salaryMin ?? b.salaryMax ?? Number.MAX_SAFE_INTEGER);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
      return { posts: posts.slice(0, args.limit) };
    },
  }),

  getPost: defineAction({
    description: "Returns one approved post by id for the detail view.",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ post: postShape.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posts)
        .where(and(eq(schema.posts.id, args.id), eq(schema.posts.status, "approved")))
        .limit(1);
      const row = rows[0];
      if (!row) return { post: null };
      const counts = await applicationCounts(ctx);
      return { post: toPost(row, counts.get(row.id) ?? 0) };
    },
  }),

  createPost: defineAction({
    description: "Creates a guardian tuition request or a tutor offer. Lands as pending unless auto-approve is on.",
    request: z.object({
      kind: kindEnum,
      authorName: z.string().trim().min(2, "আপনার নাম লিখুন").max(60),
      phone: phoneSchema,
      title: z.string().trim().min(5, "শিরোনাম একটু বিস্তারিত লিখুন").max(120),
      subjects: z.array(z.string().trim().min(1).max(40)).min(1, "অন্তত একটি বিষয় বেছে নিন").max(12),
      classes: z.array(z.string().trim().min(1).max(40)).min(1, "অন্তত একটি শ্রেণি বেছে নিন").max(12),
      area: z.string().trim().min(2, "এলাকা বেছে নিন").max(80),
      addressNote: z.string().trim().max(160).default(""),
      salaryMin: z.number().int().min(0).max(1000000).nullable().default(null),
      salaryMax: z.number().int().min(0).max(1000000).nullable().default(null),
      salaryNegotiable: z.boolean().default(false),
      daysPerWeek: z.number().int().min(1).max(7).nullable().default(null),
      mode: modeEnum.default("home"),
      medium: mediumEnum.default("bangla"),
      genderPref: genderEnum.default("any"),
      studentGender: genderEnum.default("any"),
      description: z.string().trim().max(1200).default(""),
      institution: z.string().trim().max(120).default(""),
      experience: z.string().trim().max(200).default(""),
      availability: z.string().trim().max(200).default(""),
    }),
    response: z.object({ id: z.number(), status: postStatusEnum }),
    async handler(ctx, args) {
      if (args.salaryMin != null && args.salaryMax != null && args.salaryMin > args.salaryMax) {
        throw new Error("সর্বনিম্ন বেতন সর্বোচ্চ বেতনের বেশি হতে পারে না");
      }
      const db = ctx.db<typeof schema>();
      const auto = (await getSetting(ctx, "auto_approve")) === "1";
      const status = auto ? ("approved" as const) : ("pending" as const);
      const result = await db
        .insert(schema.posts)
        .values({
          kind: args.kind,
          authorName: args.authorName,
          phone: args.phone,
          title: args.title,
          subjects: JSON.stringify(args.subjects),
          classes: JSON.stringify(args.classes),
          area: args.area,
          addressNote: args.addressNote,
          salaryMin: args.salaryMin,
          salaryMax: args.salaryMax,
          salaryNegotiable: args.salaryNegotiable ? 1 : 0,
          daysPerWeek: args.daysPerWeek,
          mode: args.mode,
          medium: args.medium,
          genderPref: args.genderPref,
          studentGender: args.studentGender,
          description: args.description,
          institution: args.institution,
          experience: args.experience,
          availability: args.availability,
          status,
        })
        .returning({ id: schema.posts.id });
      const inserted = result[0];
      if (!inserted) throw new Error("পোস্ট তৈরি হয়নি — আবার চেষ্টা করুন");
      ctx.invalidateQueries();
      return { id: inserted.id, status };
    },
  }),

  applyToPost: defineAction({
    description: "Sends an application/contact request to a post: a tutor applying to a guardian request, or a guardian contacting a tutor.",
    request: z.object({
      postId: z.number().int().positive(),
      applicantName: z.string().trim().min(2, "আপনার নাম লিখুন").max(60),
      applicantPhone: phoneSchema,
      applicantRole: z.enum(["tutor", "guardian"]),
      message: z.string().trim().max(600).default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postRows = await db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(and(eq(schema.posts.id, args.postId), eq(schema.posts.status, "approved")))
        .limit(1);
      if (!postRows[0]) throw new Error("এই পোস্টটি আর পাওয়া যাচ্ছে না");
      const result = await db
        .insert(schema.applications)
        .values({
          postId: args.postId,
          applicantName: args.applicantName,
          applicantPhone: args.applicantPhone,
          applicantRole: args.applicantRole,
          message: args.message,
        })
        .returning({ id: schema.applications.id });
      const inserted = result[0];
      if (!inserted) throw new Error("আবেদন পাঠানো যায়নি — আবার চেষ্টা করুন");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  reportPost: defineAction({
    description: "Reports a post for admin review (wrong info, spam, inappropriate, other).",
    request: z.object({
      postId: z.number().int().positive(),
      reporterName: z.string().trim().max(60).default(""),
      reason: z.enum(["wrong_info", "spam", "inappropriate", "fraud", "other"]),
      details: z.string().trim().max(500).default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.reports)
        .values({
          postId: args.postId,
          reporterName: args.reporterName,
          reason: args.reason,
          details: args.details,
        })
        .returning({ id: schema.reports.id });
      const inserted = result[0];
      if (!inserted) throw new Error("রিপোর্ট পাঠানো যায়নি — আবার চেষ্টা করুন");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  toggleFavorite: defineAction({
    description: "Bookmarks or un-bookmarks a post on this device.",
    request: z.object({ postId: z.number().int().positive() }),
    response: z.object({ favorite: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.favorites)
        .where(eq(schema.favorites.postId, args.postId))
        .limit(1);
      if (existing[0]) {
        await db.delete(schema.favorites).where(eq(schema.favorites.postId, args.postId));
        ctx.invalidateQueries();
        return { favorite: false };
      }
      await db.insert(schema.favorites).values({ postId: args.postId });
      ctx.invalidateQueries();
      return { favorite: true };
    },
  }),

  listFavorites: defineAction({
    description: "Lists bookmarked posts (approved ones) for the favourites view.",
    request: z.object({}),
    response: z.object({ posts: z.array(postShape), favoriteIds: z.array(z.number()) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const favs = await db.select().from(schema.favorites).orderBy(desc(schema.favorites.id));
      const ids = favs.map((f) => f.postId);
      if (ids.length === 0) return { posts: [], favoriteIds: [] };
      const rows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.status, "approved"));
      const counts = await applicationCounts(ctx);
      const byId = new Map(rows.map((r) => [r.id, toPost(r, counts.get(r.id) ?? 0)]));
      const posts = ids
        .map((id) => byId.get(id))
        .filter((p): p is z.infer<typeof postShape> => p != null);
      return { posts, favoriteIds: ids };
    },
  }),

  listFavoriteIds: defineAction({
    description: "Returns just the bookmarked post ids so board cards can show the bookmark state.",
    request: z.object({}),
    response: z.object({ favoriteIds: z.array(z.number()) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const favs = await db.select().from(schema.favorites);
      return { favoriteIds: favs.map((f) => f.postId) };
    },
  }),

  saveSearch: defineAction({
    description: "Saves the current board filters under a name for one-tap reuse.",
    request: z.object({
      label: z.string().trim().min(1, "খোঁজের একটি নাম দিন").max(60),
      filters: filtersShape,
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.savedSearches)
        .values({ label: args.label, filtersJson: JSON.stringify(args.filters) })
        .returning({ id: schema.savedSearches.id });
      const inserted = result[0];
      if (!inserted) throw new Error("খোঁজ সংরক্ষণ হয়নি — আবার চেষ্টা করুন");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  listSavedSearches: defineAction({
    description: "Lists saved filter presets for the board.",
    request: z.object({}),
    response: z.object({
      searches: z.array(
        z.object({ id: z.number(), label: z.string(), filters: filtersShape, createdAt: z.string() }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.savedSearches)
        .orderBy(desc(schema.savedSearches.id));
      return {
        searches: rows.map((r) => {
          let filters: Filters = { sort: "newest" };
          try {
            const parsed = filtersShape.safeParse(JSON.parse(r.filtersJson));
            if (parsed.success) filters = parsed.data;
          } catch {
            /* keep default */
          }
          return { id: r.id, label: r.label, filters, createdAt: r.createdAt.toISOString() };
        }),
      };
    },
  }),

  deleteSavedSearch: defineAction({
    description: "Deletes a saved filter preset.",
    request: z.object({ id: z.number().int().positive() }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.savedSearches).where(eq(schema.savedSearches.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ---------------- Admin ----------------

  adminVerify: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Checks the admin passcode for the admin panel.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const expected = await expectedPasscode(ctx);
      return { ok: expected.length > 0 && args.passcode === expected };
    },
  }),

  adminStats: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin dashboard counts by post status, applications and open reports.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({
      pending: z.number(),
      approved: z.number(),
      rejected: z.number(),
      closed: z.number(),
      guardianPosts: z.number(),
      tutorPosts: z.number(),
      applications: z.number(),
      newApplications: z.number(),
      openReports: z.number(),
      favorites: z.number(),
    }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.posts);
      const apps = await db.select().from(schema.applications);
      const reps = await db.select().from(schema.reports);
      const favs = await db.select().from(schema.favorites);
      return {
        pending: rows.filter((r) => r.status === "pending").length,
        approved: rows.filter((r) => r.status === "approved").length,
        rejected: rows.filter((r) => r.status === "rejected").length,
        closed: rows.filter((r) => r.status === "closed").length,
        guardianPosts: rows.filter((r) => r.kind === "guardian").length,
        tutorPosts: rows.filter((r) => r.kind === "tutor").length,
        applications: apps.length,
        newApplications: apps.filter((a) => a.status === "new").length,
        openReports: reps.filter((r) => r.status === "open").length,
        favorites: favs.length,
      };
    },
  }),

  adminListPosts: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: lists posts, optionally filtered by status and kind, newest first.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      status: postStatusEnum.optional(),
      kind: kindEnum.optional(),
    }),
    response: z.object({ posts: z.array(postShape) }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posts)
        .orderBy(desc(schema.posts.createdAt))
        .limit(300);
      const counts = await applicationCounts(ctx);
      let posts = rows.map((r) => toPost(r, counts.get(r.id) ?? 0));
      if (args.status) posts = posts.filter((p) => p.status === args.status);
      if (args.kind) posts = posts.filter((p) => p.kind === args.kind);
      return { posts };
    },
  }),

  adminSetPostStatus: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: approves, rejects, closes or re-opens a post.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      status: postStatusEnum,
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.posts)
        .set({ status: args.status, updatedAt: new Date() })
        .where(eq(schema.posts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminSetPostFlags: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: toggles a post's featured pin and tutor verified badge.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      featured: z.boolean().optional(),
      verified: z.boolean().optional(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const patch: { featured?: number; verified?: number; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (args.featured !== undefined) patch.featured = args.featured ? 1 : 0;
      if (args.verified !== undefined) patch.verified = args.verified ? 1 : 0;
      await db.update(schema.posts).set(patch).where(eq(schema.posts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminUpdatePost: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: edits a post's core fields (title, phone, area, salary, description).",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      title: z.string().trim().min(5).max(120),
      authorName: z.string().trim().min(2).max(60),
      phone: phoneSchema,
      area: z.string().trim().min(2).max(80),
      salaryMin: z.number().int().min(0).max(1000000).nullable(),
      salaryMax: z.number().int().min(0).max(1000000).nullable(),
      salaryNegotiable: z.boolean(),
      description: z.string().trim().max(1200),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.posts)
        .set({
          title: args.title,
          authorName: args.authorName,
          phone: args.phone,
          area: args.area,
          salaryMin: args.salaryMin,
          salaryMax: args.salaryMax,
          salaryNegotiable: args.salaryNegotiable ? 1 : 0,
          description: args.description,
          updatedAt: new Date(),
        })
        .where(eq(schema.posts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminDeletePost: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: permanently deletes a post together with its applications, reports and bookmarks.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.applications).where(eq(schema.applications.postId, args.id));
      await db.delete(schema.reports).where(eq(schema.reports.postId, args.id));
      await db.delete(schema.favorites).where(eq(schema.favorites.postId, args.id));
      await db.delete(schema.posts).where(eq(schema.posts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListApplications: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: lists applications with the post they belong to, newest first.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({
      applications: z.array(
        z.object({
          id: z.number(),
          postId: z.number(),
          postTitle: z.string(),
          postKind: kindEnum.nullable(),
          applicantName: z.string(),
          applicantPhone: z.string(),
          applicantRole: z.enum(["tutor", "guardian"]),
          message: z.string(),
          status: z.enum(["new", "contacted", "accepted", "rejected"]),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.applications)
        .orderBy(desc(schema.applications.createdAt))
        .limit(300);
      const postRows = await db.select().from(schema.posts);
      const byId = new Map(postRows.map((p) => [p.id, p]));
      return {
        applications: rows.map((r) => {
          const post = byId.get(r.postId);
          return {
            id: r.id,
            postId: r.postId,
            postTitle: post?.title ?? "(মুছে ফেলা পোস্ট)",
            postKind: post?.kind ?? null,
            applicantName: r.applicantName,
            applicantPhone: r.applicantPhone,
            applicantRole: r.applicantRole,
            message: r.message,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      };
    },
  }),

  adminSetApplicationStatus: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: updates an application's status (new, contacted, accepted, rejected).",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      status: z.enum(["new", "contacted", "accepted", "rejected"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.applications)
        .set({ status: args.status })
        .where(eq(schema.applications.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminDeleteApplication: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: deletes one application.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.applications).where(eq(schema.applications.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminListReports: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: lists reports with their post titles, newest first.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({
      reports: z.array(
        z.object({
          id: z.number(),
          postId: z.number(),
          postTitle: z.string(),
          reporterName: z.string(),
          reason: z.string(),
          details: z.string(),
          status: z.enum(["open", "resolved", "dismissed"]),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.reports)
        .orderBy(desc(schema.reports.createdAt))
        .limit(300);
      const postRows = await db.select().from(schema.posts);
      const byId = new Map(postRows.map((p) => [p.id, p]));
      return {
        reports: rows.map((r) => ({
          id: r.id,
          postId: r.postId,
          postTitle: byId.get(r.postId)?.title ?? "(মুছে ফেলা পোস্ট)",
          reporterName: r.reporterName,
          reason: r.reason,
          details: r.details,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  }),

  adminSetReportStatus: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: marks a report resolved or dismissed, or re-opens it.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      status: z.enum(["open", "resolved", "dismissed"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.reports)
        .set({ status: args.status })
        .where(eq(schema.reports.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminUpdateSettings: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: updates the notice banner, auto-approve flag and/or admin passcode.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      notice: z.string().trim().max(300).optional(),
      autoApprove: z.boolean().optional(),
      chatAiEnabled: z.boolean().optional(),
      newPasscode: z.string().trim().min(4).max(60).optional(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      if (args.notice !== undefined) await setSetting(ctx, "notice", args.notice);
      if (args.autoApprove !== undefined)
        await setSetting(ctx, "auto_approve", args.autoApprove ? "1" : "0");
      if (args.chatAiEnabled !== undefined)
        await setSetting(ctx, "chat_ai_enabled", args.chatAiEnabled ? "1" : "0");
      if (args.newPasscode !== undefined) {
        // When ADMIN_PASSCODE is set as an env var (production on Vercel),
        // it always wins — the passcode can only be changed there.
        if ((await envPasscode(ctx)).length > 0) {
          throw new Error(
            "পাসকোডটি ADMIN_PASSCODE env variable দিয়ে সেট করা — বদলাতে হলে Vercel-এর Environment Variables থেকে বদলান",
          );
        }
        await setSetting(ctx, "admin_passcode", args.newPasscode);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  bootstrapAdminPasscode: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "One-time deploy setup: stores the first admin passcode in the settings table when none is configured yet (no ADMIN_PASSCODE env var and nothing saved). A no-op once a passcode exists, so the passcode lives in the database/env — never in code.",
    request: z.object({ newPasscode: z.string().trim().min(4).max(60) }),
    response: z.object({ configured: z.boolean(), alreadySet: z.boolean() }),
    async handler(ctx, args) {
      const expected = await expectedPasscode(ctx);
      if (expected) return { configured: true, alreadySet: true };
      await setSetting(ctx, "admin_passcode", args.newPasscode);
      ctx.invalidateQueries();
      return { configured: true, alreadySet: false };
    },
  }),

  // ---------------- Live chat (visitor side) ----------------

  chatStart: defineAction({
    description: "Starts a live-chat conversation with the AI assistant and returns its id and welcome message.",
    request: z.object({
      visitorName: z.string().trim().max(60).default(""),
      visitorPhone: z.string().trim().max(20).default(""),
      lang: z.enum(["bn", "en"]).default("bn"),
    }),
    response: z.object({
      conversationId: z.number(),
      aiEnabled: z.boolean(),
      messages: z.array(chatMessageShape),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.chatConversations)
        .values({ visitorName: args.visitorName, visitorPhone: args.visitorPhone })
        .returning({ id: schema.chatConversations.id });
      const conv = result[0];
      if (!conv) throw new Error("চ্যাট শুরু করা যায়নি — আবার চেষ্টা করুন");
      const enabled = await chatAiEnabled(ctx);
      if (enabled) {
        await db.insert(schema.chatMessages).values({
          conversationId: conv.id,
          sender: "ai",
          body: chatWelcome(args.lang),
        });
      }
      ctx.invalidateQueries();
      return {
        conversationId: conv.id,
        aiEnabled: enabled,
        messages: await loadMessages(ctx, conv.id),
      };
    },
  }),

  chatSend: defineAction({
    description: "Sends a visitor chat message; the AI assistant replies unless it is off, the admin has taken over, or the topic is sensitive (then it escalates to the admin).",
    request: z.object({
      conversationId: z.number().int().positive(),
      body: z.string().trim().min(1, "বার্তা লিখুন").max(1000),
      lang: z.enum(["bn", "en"]).default("bn"),
    }),
    response: z.object({
      messages: z.array(chatMessageShape),
      mode: z.enum(["ai", "admin"]),
      aiEnabled: z.boolean(),
      needsAdmin: z.boolean(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const conv = await loadConversation(ctx, args.conversationId);
      if (!conv) throw new Error("চ্যাটটি পাওয়া যাচ্ছে না");
      await db.insert(schema.chatMessages).values({
        conversationId: conv.id,
        sender: "visitor",
        body: args.body,
      });
      await db
        .update(schema.chatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.chatConversations.id, conv.id));

      const enabled = await chatAiEnabled(ctx);
      let needsAdmin = conv.needsAdmin === 1;

      // The AI answers only when it is switched on AND the admin has not
      // taken this chat over. Otherwise the message waits for the admin.
      if (enabled && conv.mode === "ai") {
        if (isSensitiveTopic(args.body)) {
          needsAdmin = true;
          await db
            .update(schema.chatConversations)
            .set({ needsAdmin: 1, updatedAt: new Date() })
            .where(eq(schema.chatConversations.id, conv.id));
          await db.insert(schema.chatMessages).values({
            conversationId: conv.id,
            sender: "ai",
            body: chatEscalation(args.lang),
          });
        } else {
          const history = await loadMessages(ctx, conv.id);
          try {
            const replyText = await generateAiReply(ctx, history, args.lang);
            await db.insert(schema.chatMessages).values({
              conversationId: conv.id,
              sender: "ai",
              body: replyText,
            });
          } catch {
            needsAdmin = true;
            await db
              .update(schema.chatConversations)
              .set({ needsAdmin: 1, updatedAt: new Date() })
              .where(eq(schema.chatConversations.id, conv.id));
            await db.insert(schema.chatMessages).values({
              conversationId: conv.id,
              sender: "ai",
              body: chatFallback(args.lang),
            });
          }
        }
      }

      ctx.invalidateQueries();
      return {
        messages: await loadMessages(ctx, conv.id),
        mode: conv.mode,
        aiEnabled: enabled,
        needsAdmin,
      };
    },
  }),

  chatPoll: defineAction({
    description: "Returns the current messages and state of a chat conversation so the widget can show admin/AI replies.",
    request: z.object({ conversationId: z.number().int().positive() }),
    response: z.object({
      messages: z.array(chatMessageShape),
      mode: z.enum(["ai", "admin"]),
      aiEnabled: z.boolean(),
      needsAdmin: z.boolean(),
    }),
    async handler(ctx, args) {
      const conv = await loadConversation(ctx, args.conversationId);
      if (!conv) {
        return { messages: [], mode: "ai" as const, aiEnabled: false, needsAdmin: false };
      }
      return {
        messages: await loadMessages(ctx, conv.id),
        mode: conv.mode,
        aiEnabled: await chatAiEnabled(ctx),
        needsAdmin: conv.needsAdmin === 1,
      };
    },
  }),

  // ---------------- Live chat (admin inbox) ----------------

  adminChatList: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: lists all chat conversations with their latest message, newest activity first.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({ conversations: z.array(chatConversationShape) }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const convs = await db
        .select()
        .from(schema.chatConversations)
        .orderBy(desc(schema.chatConversations.updatedAt))
        .limit(200);
      const allMessages = await db
        .select()
        .from(schema.chatMessages)
        .orderBy(schema.chatMessages.id);
      const byConv = new Map<number, ChatMessageRow[]>();
      for (const m of allMessages) {
        const list = byConv.get(m.conversationId) ?? [];
        list.push(m);
        byConv.set(m.conversationId, list);
      }
      return {
        conversations: convs.map((c) => {
          const msgs = byConv.get(c.id) ?? [];
          const last = msgs[msgs.length - 1];
          return {
            id: c.id,
            visitorName: c.visitorName,
            visitorPhone: c.visitorPhone,
            mode: c.mode,
            needsAdmin: c.needsAdmin === 1,
            lastMessage: last ? last.body : "",
            messageCount: msgs.length,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          };
        }),
      };
    },
  }),

  adminChatGet: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: returns one chat conversation with all its messages.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      conversationId: z.number().int().positive(),
    }),
    response: z.object({
      conversation: chatConversationShape.nullable(),
      messages: z.array(chatMessageShape),
    }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const conv = await loadConversation(ctx, args.conversationId);
      if (!conv) return { conversation: null, messages: [] };
      const messages = await loadMessages(ctx, conv.id);
      const last = messages[messages.length - 1];
      return {
        conversation: {
          id: conv.id,
          visitorName: conv.visitorName,
          visitorPhone: conv.visitorPhone,
          mode: conv.mode,
          needsAdmin: conv.needsAdmin === 1,
          lastMessage: last ? last.body : "",
          messageCount: messages.length,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
        },
        messages,
      };
    },
  }),

  adminChatReply: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: replies in a chat conversation. Replying takes the chat over — the AI stays silent until the admin hands it back.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      conversationId: z.number().int().positive(),
      body: z.string().trim().min(1, "বার্তা লিখুন").max(1000),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const conv = await loadConversation(ctx, args.conversationId);
      if (!conv) throw new Error("চ্যাটটি পাওয়া যাচ্ছে না");
      await db.insert(schema.chatMessages).values({
        conversationId: conv.id,
        sender: "admin",
        body: args.body,
      });
      await db
        .update(schema.chatConversations)
        .set({ mode: "admin", needsAdmin: 0, updatedAt: new Date() })
        .where(eq(schema.chatConversations.id, conv.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminChatSetMode: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: takes a chat over (mode=admin, AI pauses) or hands it back to the AI assistant (mode=ai).",
    request: z.object({
      passcode: z.string().min(1).max(60),
      conversationId: z.number().int().positive(),
      mode: z.enum(["ai", "admin"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const patch: { mode: "ai" | "admin"; needsAdmin?: number; updatedAt: Date } = {
        mode: args.mode,
        updatedAt: new Date(),
      };
      if (args.mode === "ai") patch.needsAdmin = 0;
      await db
        .update(schema.chatConversations)
        .set(patch)
        .where(eq(schema.chatConversations.id, args.conversationId));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
