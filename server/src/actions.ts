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
// Chatbot training (shared with the Vercel routes in api/chat.ts and
// api/admin.ts): system prompt, default Q&A pairs, parse/format
// helpers. Single source of truth — server/src/chatTraining.ts.
import {
  CHAT_SYSTEM_PROMPT,
  CHAT_TRAINING_SETTING_KEY,
  DEFAULT_TRAINING_QA,
  formatTrainingQAForPrompt,
  parseTrainingQA,
  type TrainingQA,
} from "./chatTraining";

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

/** Tutor-account crypto runs in the privileged host handlers
    (src/privileged.ts) — same scrypt parameters as before, so existing
    password hashes keep verifying. */
const CRYPTO_PRIVILEGED = [
  Privileged.hashPassword,
  Privileged.verifyPassword,
  Privileged.randomToken,
] as const;

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

/**
 * Public posts never carry a full phone number: `mask` replaces it with
 * the masked form (017XX-XXX123). Admin calls keep the full number —
 * admin sees everything. The mask is applied here, server-side, so no
 * public response can leak a full phone even if the client is changed.
 */
function toPost(
  row: PostRow,
  applicationCount: number,
  mask = false,
): z.infer<typeof postShape> {
  return {
    id: row.id,
    kind: row.kind,
    authorName: row.authorName,
    phone: mask ? maskPhone(row.phone) : row.phone,
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

/* ---------------- tutor accounts ---------------- */

const tutorGenderEnum = z.enum(["male", "female", "other"]);

const tutorProfileShape = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  university: z.string(),
  department: z.string(),
  subjects: z.array(z.string()),
  classes: z.array(z.string()),
  areas: z.array(z.string()),
  experience: z.string(),
  fees: z.string(),
  gender: tutorGenderEnum,
  photoUrl: z.string().nullable(),
  verified: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type TutorRow = typeof schema.tutors.$inferSelect;

function toTutorProfile(row: TutorRow): z.infer<typeof tutorProfileShape> {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    university: row.university,
    department: row.department,
    subjects: parseList(row.subjects),
    classes: parseList(row.classes),
    areas: parseList(row.areas),
    experience: row.experience,
    fees: row.fees,
    gender: row.gender,
    photoUrl: row.photoUrl,
    verified: row.verified === 1,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ---------------- poster accounts (Facebook group posting, /poster) ----------------
   Same account shape as tutors, with an approval gate instead of a
   verified flag: status starts 'pending'; only 'approved' posters see
   the posting task. A poster CAN log in while pending — inside they see
   only "waiting for admin approval" until the admin approves them. */

const posterStatusEnum = z.enum(["pending", "approved", "rejected"]);

const posterProfileShape = z.object({
  id: z.number(),
  name: z.string(),
  phone: z.string(),
  status: posterStatusEnum,
  createdAt: z.string(),
});

const posterGroupShape = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  done: z.boolean(),
  doneAt: z.string().nullable(),
  sortOrder: z.number(),
});

type PosterRow = typeof schema.posters.$inferSelect;

function toPosterProfile(row: PosterRow): z.infer<typeof posterProfileShape> {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPosterGroup(
  row: typeof schema.posterGroups.$inferSelect,
): z.infer<typeof posterGroupShape> {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    done: row.done === 1,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    sortOrder: row.sortOrder,
  };
}

/** scrypt password hashing via the privileged host handler
    (64-byte key, 16-byte random salt, hex-encoded — unchanged scheme). */
async function hashPassword(
  ctx: Ctx,
  password: string,
): Promise<{ hash: string; salt: string }> {
  return await ctx.executePrivileged(Privileged.hashPassword, { password });
}

async function verifyPassword(
  ctx: Ctx,
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const res = await ctx.executePrivileged(Privileged.verifyPassword, {
    password,
    hash,
    salt,
  });
  return res.ok;
}

/** Login tokens live 30 days. */
const TUTOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function createTutorSession(ctx: Ctx, tutorId: number): Promise<string> {
  const db = ctx.db<typeof schema>();
  const { token } = await ctx.executePrivileged(Privileged.randomToken, { bytes: 32 });
  await db.insert(schema.tutorSessions).values({
    token,
    tutorId,
    expiresAt: new Date(Date.now() + TUTOR_SESSION_TTL_MS),
  });
  return token;
}

/** Poster login tokens live 30 days (same shape as tutor sessions). */
const POSTER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function createPosterSession(ctx: Ctx, posterId: number): Promise<string> {
  const db = ctx.db<typeof schema>();
  const { token } = await ctx.executePrivileged(Privileged.randomToken, { bytes: 32 });
  await db.insert(schema.posterSessions).values({
    token,
    posterId,
    expiresAt: new Date(Date.now() + POSTER_SESSION_TTL_MS),
  });
  return token;
}

async function resolvePoster(ctx: Ctx, token: string): Promise<PosterRow | null> {
  const db = ctx.db<typeof schema>();
  const sessions = await db
    .select()
    .from(schema.posterSessions)
    .where(eq(schema.posterSessions.token, token))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(schema.posterSessions).where(eq(schema.posterSessions.id, session.id));
    return null;
  }
  const rows = await db
    .select()
    .from(schema.posters)
    .where(eq(schema.posters.id, session.posterId))
    .limit(1);
  return rows[0] ?? null;
}

async function listPosterGroups(ctx: Ctx): Promise<z.infer<typeof posterGroupShape>[]> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.posterGroups)
    .orderBy(schema.posterGroups.sortOrder, schema.posterGroups.id);
  return rows.map(toPosterGroup);
}

/** Loads the posting task for an approved poster; throws when the
    poster is still waiting for approval (or was rejected). */
async function approvedPosterTask(ctx: Ctx, token: string) {
  const poster = await resolvePoster(ctx, token);
  if (!poster) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
  if (poster.status !== "approved") {
    throw new Error("অ্যাডমিন এখনো অ্যাপ্রুভ করেনি — অনুমোদনের পর গ্রুপ লিস্ট দেখতে পারবেন");
  }
  const groups = await listPosterGroups(ctx);
  return {
    postText: await getSetting(ctx, "poster_post_text"),
    groups,
    doneCount: groups.filter((g) => g.done).length,
    totalCount: groups.length,
  };
}

/** Masks a phone number for tutor-facing views: 01700123456 -> 017XX-XXX456.
    Full applicant numbers are never sent to tutors until the middleman
    rules land; only this masked form leaves the server. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}XX-XXX${digits.slice(-3)}`;
}

/**
 * Normalises a phone for comparison: digits only, and a leading
 * Bangladesh country code (880) becomes the local leading 0, so
 * 8801712345678 and 01712345678 match. Used for the guardian phone
 * check — a guardian proves a post is theirs by entering the number
 * they posted with.
 */
function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhoneDigits(a);
  const nb = normalizePhoneDigits(b);
  return na.length >= 6 && na === nb;
}

const applicationStatusEnum = z.enum(["new", "contacted", "accepted", "rejected"]);
const commissionStatusEnum = z.enum(["pending", "paid", "waived"]);

type ApplicationRow = typeof schema.applications.$inferSelect;

/**
 * Accepts an application and creates its commission record: status
 * "pending", amount NULL (empty — the admin fills it in; no commission
 * rate has been set). A commission already marked paid/waived is left
 * alone. Existing accepted demo applications already have these
 * defaults from the new columns, so no data migration is needed.
 */
async function acceptApplication(ctx: Ctx, row: ApplicationRow): Promise<void> {
  const db = ctx.db<typeof schema>();
  const patch: { status: "accepted"; commissionStatus?: "pending" } = { status: "accepted" };
  if (row.commissionStatus !== "paid" && row.commissionStatus !== "waived") {
    patch.commissionStatus = "pending";
  }
  await db
    .update(schema.applications)
    .set(patch)
    .where(eq(schema.applications.id, row.id));
}

async function loadApplication(ctx: Ctx, id: number): Promise<ApplicationRow | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Resolves a session token to its tutor, or null when missing/expired. */
async function resolveTutor(ctx: Ctx, token: string): Promise<TutorRow | null> {
  const db = ctx.db<typeof schema>();
  const sessions = await db
    .select()
    .from(schema.tutorSessions)
    .where(eq(schema.tutorSessions.token, token))
    .limit(1);
  const session = sessions[0];
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(schema.tutorSessions).where(eq(schema.tutorSessions.id, session.id));
    return null;
  }
  const rows = await db
    .select()
    .from(schema.tutors)
    .where(eq(schema.tutors.id, session.tutorId))
    .limit(1);
  return rows[0] ?? null;
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

// One admin-taught question–answer pair for the chatbot (training data).
const trainingQaShape = z.object({
  q: z.string().trim().min(1).max(300),
  a: z.string().trim().min(1).max(1000),
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

// Admin-taught Q&A for the chatbot: the pairs stored in settings
// (key chat_training_qa, edited in the admin panel's "AI প্রশিক্ষণ"
// section); the defaults in server/src/chatTraining.ts apply until the admin
// saves their own pairs.
async function loadTrainingQA(ctx: Ctx): Promise<TrainingQA[]> {
  const stored = parseTrainingQA(await getSetting(ctx, CHAT_TRAINING_SETTING_KEY));
  return stored.length > 0 ? stored : DEFAULT_TRAINING_QA;
}

async function generateAiReply(
  ctx: Ctx,
  history: { sender: string; body: string }[],
  lang: "bn" | "en",
): Promise<string> {
  const transcript = history
    .slice(-12)
    .map((m) => `${m.sender === "visitor" ? "Visitor" : m.sender === "ai" ? "Assistant" : "Admin"}: ${m.body}`)
    .join("\n");
  const qa = await loadTrainingQA(ctx);
  const reply = await ctx.inference.complete(
    `Conversation so far:\n${transcript}\n\nWrite the assistant's next reply. The visitor's language preference is ${lang === "en" ? "English" : "Bangla"} — match the visitor's last message language if it differs.`,
    { system: CHAT_SYSTEM_PROMPT + formatTrainingQAForPrompt(qa), schema: z.string(), timeout_secs: 60 },
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
  gender: genderEnum.optional(),
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
      let posts = rows.map((r) => toPost(r, counts.get(r.id) ?? 0, true));
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
      return { post: toPost(row, counts.get(row.id) ?? 0, true) };
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

  guardianViewApplications: defineAction({
    description: "Guardian side of the middleman flow (no account): a guardian enters the phone number they posted with; when it matches the post's stored phone, returns that post's applications with applicant phones masked except for accepted ones (full phone shown). A wrong phone returns a generic error and no data.",
    request: z.object({
      postId: z.number().int().positive(),
      phone: phoneSchema,
    }),
    response: z.object({
      postTitle: z.string(),
      applications: z.array(
        z.object({
          id: z.number(),
          applicantName: z.string(),
          applicantRole: z.enum(["tutor", "guardian"]),
          applicantPhoneMasked: z.string(),
          applicantPhone: z.string().nullable(),
          message: z.string(),
          status: applicationStatusEnum,
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postRows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.id, args.postId))
        .limit(1);
      const post = postRows[0];
      // Generic error either way: never confirm whether the number
      // exists or which post it belongs to.
      if (!post || !phonesMatch(args.phone, post.phone)) {
        throw new Error("মোবাইল নম্বরটি এই পোস্টের সঙ্গে মিলছে না — আবার চেষ্টা করুন");
      }
      const rows = await db
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.postId, args.postId))
        .orderBy(desc(schema.applications.createdAt));
      return {
        postTitle: post.title,
        applications: rows.map((a) => ({
          id: a.id,
          applicantName: a.applicantName,
          applicantRole: a.applicantRole,
          applicantPhoneMasked: maskPhone(a.applicantPhone),
          // Full phone only once the application is accepted.
          applicantPhone: a.status === "accepted" ? a.applicantPhone : null,
          message: a.message,
          status: a.status,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    },
  }),

  guardianSetApplicationStatus: defineAction({
    description: "Guardian side: accepts or rejects an application on their own post. Proved by the phone number they posted with — no account or session.",
    request: z.object({
      postId: z.number().int().positive(),
      phone: phoneSchema,
      applicationId: z.number().int().positive(),
      status: z.enum(["accepted", "rejected"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      const postRows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.id, args.postId))
        .limit(1);
      const post = postRows[0];
      if (!post || !phonesMatch(args.phone, post.phone)) {
        throw new Error("মোবাইল নম্বরটি এই পোস্টের সঙ্গে মিলছে না — আবার চেষ্টা করুন");
      }
      const app = await loadApplication(ctx, args.applicationId);
      if (!app || app.postId !== args.postId) {
        throw new Error("আবেদনটি পাওয়া যাচ্ছে না");
      }
      if (args.status === "accepted") {
        await acceptApplication(ctx, app);
      } else {
        await db
          .update(schema.applications)
          .set({ status: "rejected" })
          .where(eq(schema.applications.id, app.id));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  tutorSetApplicationStatus: defineAction({
    description: "Tutor side: accepts, rejects or marks as contacted an application received on the tutor's own post. Requires the tutor's login token and ownership of the post.",
    request: z.object({
      token: z.string().min(1).max(200),
      applicationId: z.number().int().positive(),
      status: z.enum(["contacted", "accepted", "rejected"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      const tutor = await resolveTutor(ctx, args.token);
      if (!tutor) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
      const app = await loadApplication(ctx, args.applicationId);
      if (!app) throw new Error("আবেদনটি পাওয়া যাচ্ছে না");
      const postRows = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.id, app.postId))
        .limit(1);
      const post = postRows[0];
      // Only applications on the tutor's own posts (phone-linked).
      if (!post || post.phone !== tutor.phone) {
        throw new Error("এই আবেদনটি আপনার পোস্টের নয়");
      }
      if (args.status === "accepted") {
        await acceptApplication(ctx, app);
      } else {
        await db
          .update(schema.applications)
          .set({ status: args.status })
          .where(eq(schema.applications.id, app.id));
      }
      ctx.invalidateQueries();
      return { ok: true };
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
      const byId = new Map(rows.map((r) => [r.id, toPost(r, counts.get(r.id) ?? 0, true)]));
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

  // ---------------- Tutor accounts ----------------
  //
  // Tutors sign up and log in; guardians never do — they keep posting
  // without an account. Passwords are stored as a scrypt hash + random
  // salt (never plaintext). Login returns a random token (30-day expiry)
  // stored in tutor_sessions; the token is passed back as `token` on
  // tutorMe / tutorUpdateProfile. The public profile never includes
  // passwordHash / passwordSalt.

  tutorSignup: defineAction({
    privileged: CRYPTO_PRIVILEGED,
    description: "Registers a tutor account: name, phone, password, university, department, subjects, classes, areas, experience, fees, gender and an optional photo URL. Returns the public profile plus a login token.",
    request: z.object({
      name: z.string().trim().min(2, "আপনার নাম লিখুন").max(60),
      phone: phoneSchema,
      password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে").max(100),
      university: z.string().trim().min(2, "বিশ্ববিদ্যালয়ের নাম লিখুন").max(120),
      department: z.string().trim().min(2, "বিভাগের নাম লিখুন").max(120),
      subjects: z.array(z.string().trim().min(1).max(40)).min(1, "অন্তত একটি বিষয় বেছে নিন").max(12),
      classes: z.array(z.string().trim().min(1).max(40)).min(1, "অন্তত একটি শ্রেণি বেছে নিন").max(12),
      areas: z.array(z.string().trim().min(1).max(80)).min(1, "অন্তত একটি এলাকা বেছে নিন").max(12),
      experience: z.string().trim().max(200).default(""),
      fees: z.string().trim().max(120).default(""),
      gender: tutorGenderEnum,
      photoUrl: z.string().trim().max(500).nullable().default(null),
    }),
    response: z.object({ tutor: tutorProfileShape, token: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select({ id: schema.tutors.id })
        .from(schema.tutors)
        .where(eq(schema.tutors.phone, args.phone))
        .limit(1);
      if (existing[0]) {
        throw new Error("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে — লগইন করুন");
      }
      const { hash, salt } = await hashPassword(ctx, args.password);
      const result = await db
        .insert(schema.tutors)
        .values({
          name: args.name,
          phone: args.phone,
          passwordHash: hash,
          passwordSalt: salt,
          university: args.university,
          department: args.department,
          subjects: JSON.stringify(args.subjects),
          classes: JSON.stringify(args.classes),
          areas: JSON.stringify(args.areas),
          experience: args.experience,
          fees: args.fees,
          gender: args.gender,
          photoUrl: args.photoUrl && args.photoUrl.length > 0 ? args.photoUrl : null,
        })
        .returning();
      const row = result[0];
      if (!row) throw new Error("অ্যাকাউন্ট তৈরি হয়নি — আবার চেষ্টা করুন");
      const token = await createTutorSession(ctx, row.id);
      ctx.invalidateQueries();
      return { tutor: toTutorProfile(row), token };
    },
  }),

  tutorLogin: defineAction({
    privileged: CRYPTO_PRIVILEGED,
    description: "Logs a tutor in with phone and password. Returns the public profile plus a login token.",
    request: z.object({
      phone: phoneSchema,
      password: z.string().min(1).max(100),
    }),
    response: z.object({ tutor: tutorProfileShape, token: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.tutors)
        .where(eq(schema.tutors.phone, args.phone))
        .limit(1);
      const row = rows[0];
      if (!row || !(await verifyPassword(ctx, args.password, row.passwordHash, row.passwordSalt))) {
        throw new Error("মোবাইল নম্বর বা পাসওয়ার্ড ভুল — আবার চেষ্টা করুন");
      }
      const token = await createTutorSession(ctx, row.id);
      return { tutor: toTutorProfile(row), token };
    },
  }),

  tutorMe: defineAction({
    description: "Returns the logged-in tutor's public profile for a session token.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ tutor: tutorProfileShape }),
    async handler(ctx, args) {
      const row = await resolveTutor(ctx, args.token);
      if (!row) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
      return { tutor: toTutorProfile(row) };
    },
  }),

  tutorUpdateProfile: defineAction({
    description: "Lets a logged-in tutor edit their own profile (name, phone, university, department, subjects, classes, areas, experience, fees, gender, photo URL). Only the fields sent are changed.",
    request: z.object({
      token: z.string().min(1).max(200),
      name: z.string().trim().min(2).max(60).optional(),
      phone: phoneSchema.optional(),
      university: z.string().trim().min(2).max(120).optional(),
      department: z.string().trim().min(2).max(120).optional(),
      subjects: z.array(z.string().trim().min(1).max(40)).min(1).max(12).optional(),
      classes: z.array(z.string().trim().min(1).max(40)).min(1).max(12).optional(),
      areas: z.array(z.string().trim().min(1).max(80)).min(1).max(12).optional(),
      experience: z.string().trim().max(200).optional(),
      fees: z.string().trim().max(120).optional(),
      gender: tutorGenderEnum.optional(),
      photoUrl: z.string().trim().max(500).nullable().optional(),
    }),
    response: z.object({ tutor: tutorProfileShape }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row = await resolveTutor(ctx, args.token);
      if (!row) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
      if (args.phone !== undefined && args.phone !== row.phone) {
        const clash = await db
          .select({ id: schema.tutors.id })
          .from(schema.tutors)
          .where(eq(schema.tutors.phone, args.phone))
          .limit(1);
        if (clash[0]) throw new Error("এই মোবাইল নম্বরটি অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে");
      }
      const patch: Partial<typeof row> & { updatedAt: Date } = { updatedAt: new Date() };
      if (args.name !== undefined) patch.name = args.name;
      if (args.phone !== undefined) patch.phone = args.phone;
      if (args.university !== undefined) patch.university = args.university;
      if (args.department !== undefined) patch.department = args.department;
      if (args.subjects !== undefined) patch.subjects = JSON.stringify(args.subjects);
      if (args.classes !== undefined) patch.classes = JSON.stringify(args.classes);
      if (args.areas !== undefined) patch.areas = JSON.stringify(args.areas);
      if (args.experience !== undefined) patch.experience = args.experience;
      if (args.fees !== undefined) patch.fees = args.fees;
      if (args.gender !== undefined) patch.gender = args.gender;
      if (args.photoUrl !== undefined) {
        patch.photoUrl = args.photoUrl && args.photoUrl.length > 0 ? args.photoUrl : null;
      }
      await db.update(schema.tutors).set(patch).where(eq(schema.tutors.id, row.id));
      const updated = await db
        .select()
        .from(schema.tutors)
        .where(eq(schema.tutors.id, row.id))
        .limit(1);
      const fresh = updated[0];
      if (!fresh) throw new Error("প্রোফাইল পাওয়া যাচ্ছে না");
      ctx.invalidateQueries();
      return { tutor: toTutorProfile(fresh) };
    },
  }),

  tutorMyApplications: defineAction({
    description: "Returns the logged-in tutor's applications: (a) applications the tutor sent, with the post title and the post author's (guardian's) phone — masked, except the FULL number once the application is accepted; and (b) applications received on the tutor's own posts, with the applicant's phone masked except the FULL number once the application is accepted.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({
      sent: z.array(
        z.object({
          id: z.number(),
          postId: z.number(),
          postTitle: z.string(),
          postAuthorPhoneMasked: z.string(),
          postAuthorPhone: z.string().nullable(),
          message: z.string(),
          status: z.enum(["new", "contacted", "accepted", "rejected"]),
          createdAt: z.string(),
        }),
      ),
      received: z.array(
        z.object({
          id: z.number(),
          postId: z.number(),
          postTitle: z.string(),
          applicantName: z.string(),
          applicantPhoneMasked: z.string(),
          applicantPhone: z.string().nullable(),
          message: z.string(),
          status: z.enum(["new", "contacted", "accepted", "rejected"]),
          createdAt: z.string(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const tutor = await resolveTutor(ctx, args.token);
      if (!tutor) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
      const apps = await db
        .select()
        .from(schema.applications)
        .orderBy(desc(schema.applications.createdAt));
      const postRows = await db.select().from(schema.posts);
      const byId = new Map(postRows.map((p) => [p.id, p]));
      const byDesc = (
        a: { createdAt: Date },
        b: { createdAt: Date },
      ) => b.createdAt.getTime() - a.createdAt.getTime();
      return {
        sent: apps
          .filter((a) => a.applicantPhone === tutor.phone)
          .sort(byDesc)
          .map((a) => {
            const postPhone = byId.get(a.postId)?.phone ?? "";
            return {
              id: a.id,
              postId: a.postId,
              postTitle: byId.get(a.postId)?.title ?? "",
              postAuthorPhoneMasked: maskPhone(postPhone),
              // The guardian's full phone is revealed only once this
              // application is accepted.
              postAuthorPhone: a.status === "accepted" ? postPhone : null,
              message: a.message,
              status: a.status,
              createdAt: a.createdAt.toISOString(),
            };
          }),
        received: apps
          .filter((a) => byId.get(a.postId)?.phone === tutor.phone)
          .sort(byDesc)
          .map((a) => ({
            id: a.id,
            postId: a.postId,
            postTitle: byId.get(a.postId)?.title ?? "",
            applicantName: a.applicantName,
            applicantPhoneMasked: maskPhone(a.applicantPhone),
            // The applicant's full phone is revealed only once this
            // application is accepted.
            applicantPhone: a.status === "accepted" ? a.applicantPhone : null,
            message: a.message,
            status: a.status,
            createdAt: a.createdAt.toISOString(),
          })),
      };
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
    description: "Admin: edits a post's full set of fields (same fields as the create form).",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      title: z.string().trim().min(5).max(120),
      authorName: z.string().trim().min(2).max(60),
      phone: phoneSchema,
      subjects: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
      classes: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
      area: z.string().trim().min(2).max(80),
      addressNote: z.string().trim().max(160).default(""),
      salaryMin: z.number().int().min(0).max(1000000).nullable(),
      salaryMax: z.number().int().min(0).max(1000000).nullable(),
      salaryNegotiable: z.boolean(),
      daysPerWeek: z.number().int().min(1).max(7).nullable().default(null),
      mode: modeEnum.default("home"),
      medium: mediumEnum.default("bangla"),
      genderPref: genderEnum.default("any"),
      studentGender: genderEnum.default("any"),
      description: z.string().trim().max(1200),
      institution: z.string().trim().max(120).default(""),
      experience: z.string().trim().max(200).default(""),
      availability: z.string().trim().max(200).default(""),
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
          commissionAmount: z.number().nullable(),
          commissionStatus: commissionStatusEnum,
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
            commissionAmount: r.commissionAmount,
            commissionStatus: r.commissionStatus,
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
      if (args.status === "accepted") {
        const app = await loadApplication(ctx, args.id);
        if (app) await acceptApplication(ctx, app);
      } else {
        await db
          .update(schema.applications)
          .set({ status: args.status })
          .where(eq(schema.applications.id, args.id));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminSetCommission: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: edits a commission record on an application — the amount (BDT, empty allowed) and/or the status (pending, paid, waived). No commission rate is set anywhere; the amount is whatever the admin enters.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      amount: z.number().int().min(0).max(10000000).nullable().optional(),
      status: commissionStatusEnum.optional(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const patch: { commissionAmount?: number | null; commissionStatus?: "pending" | "paid" | "waived" } = {};
      if (args.amount !== undefined) patch.commissionAmount = args.amount;
      if (args.status !== undefined) patch.commissionStatus = args.status;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db
        .update(schema.applications)
        .set(patch)
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

  // ---------------- Facebook group posting (/poster) ----------------
  // Poster accounts: the poster signs up with their own name/phone/
  // password and CAN log in, but sees no task until an admin approves
  // them — posterGet throws while status is 'pending'/'rejected', and
  // the client shows "waiting for admin approval" instead.

  posterSignup: defineAction({
    privileged: CRYPTO_PRIVILEGED,
    description: "Registers a poster account: name, phone and password. The account starts 'pending' — the poster can log in but sees no task until an admin approves them. Returns the public profile plus a login token.",
    request: z.object({
      name: z.string().trim().min(2, "আপনার নাম লিখুন").max(60),
      phone: phoneSchema,
      password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে").max(100),
    }),
    response: z.object({ poster: posterProfileShape, token: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select({ id: schema.posters.id })
        .from(schema.posters)
        .where(eq(schema.posters.phone, args.phone))
        .limit(1);
      if (existing[0]) {
        throw new Error("এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট আছে — লগইন করুন");
      }
      const { hash, salt } = await hashPassword(ctx, args.password);
      const result = await db
        .insert(schema.posters)
        .values({ name: args.name, phone: args.phone, passwordHash: hash, passwordSalt: salt })
        .returning();
      const row = result[0];
      if (!row) throw new Error("অ্যাকাউন্ট তৈরি হয়নি — আবার চেষ্টা করুন");
      const token = await createPosterSession(ctx, row.id);
      ctx.invalidateQueries();
      return { poster: toPosterProfile(row), token };
    },
  }),

  posterLogin: defineAction({
    privileged: CRYPTO_PRIVILEGED,
    description: "Logs a poster in with phone and password. Login works even while the account is still pending approval — the task itself stays hidden until approval. Returns the public profile plus a login token.",
    request: z.object({
      phone: phoneSchema,
      password: z.string().min(1).max(100),
    }),
    response: z.object({ poster: posterProfileShape, token: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posters)
        .where(eq(schema.posters.phone, args.phone))
        .limit(1);
      const row = rows[0];
      if (!row || !(await verifyPassword(ctx, args.password, row.passwordHash, row.passwordSalt))) {
        throw new Error("মোবাইল নম্বর বা পাসওয়ার্ড ভুল — আবার চেষ্টা করুন");
      }
      const token = await createPosterSession(ctx, row.id);
      return { poster: toPosterProfile(row), token };
    },
  }),

  posterMe: defineAction({
    description: "Returns the logged-in poster's public profile (including approval status) for a session token.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ poster: posterProfileShape }),
    async handler(ctx, args) {
      const row = await resolvePoster(ctx, args.token);
      if (!row) throw new Error("সেশন শেষ হয়ে গেছে — আবার লগইন করুন");
      return { poster: toPosterProfile(row) };
    },
  }),

  posterGet: defineAction({
    description: "Returns the posting task for an approved poster: the post text, the group list in order, and done/total counts. Throws while the poster is still waiting for admin approval.",
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({
      postText: z.string(),
      groups: z.array(posterGroupShape),
      doneCount: z.number(),
      totalCount: z.number(),
    }),
    async handler(ctx, args) {
      return approvedPosterTask(ctx, args.token);
    },
  }),

  posterComplete: defineAction({
    description: "Marks one Facebook group done for an approved poster (idempotent).",
    request: z.object({
      token: z.string().min(1).max(200),
      groupId: z.number().int().positive(),
    }),
    response: z.object({
      ok: z.literal(true),
      groups: z.array(posterGroupShape),
      doneCount: z.number(),
      totalCount: z.number(),
    }),
    async handler(ctx, args) {
      await approvedPosterTask(ctx, args.token);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.posterGroups)
        .set({ done: 1, doneAt: new Date() })
        .where(eq(schema.posterGroups.id, args.groupId));
      const groups = await listPosterGroups(ctx);
      ctx.invalidateQueries();
      return {
        ok: true as const,
        groups,
        doneCount: groups.filter((g) => g.done).length,
        totalCount: groups.length,
      };
    },
  }),

  adminPosterList: defineAction({
    description: "Admin: returns the post text and the full group list (including done state) for the group-posting manager.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({ postText: z.string(), groups: z.array(posterGroupShape) }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      return {
        postText: await getSetting(ctx, "poster_post_text"),
        groups: await listPosterGroups(ctx),
      };
    },
  }),

  adminPosterSetText: defineAction({
    description: "Admin: saves the post text the poster copies into each Facebook group.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      text: z.string().max(5000),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      await setSetting(ctx, "poster_post_text", args.text);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminPosterAddGroup: defineAction({
    description: "Admin: adds a Facebook group (name + group URL) to the posting list.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      name: z.string().trim().min(1, "গ্রুপের নাম লিখুন").max(120),
      url: z.string().trim().min(1, "সঠিক গ্রুপের লিংক দিন").max(500),
    }),
    response: z.object({ ok: z.literal(true), id: z.number() }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      if (!/^https?:\/\/.{4,500}$/.test(args.url)) throw new Error("সঠিক গ্রুপের লিংক দিন");
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.posterGroups).orderBy(desc(schema.posterGroups.sortOrder)).limit(1);
      const order = (rows[0]?.sortOrder ?? 0) + 1;
      const result = await db
        .insert(schema.posterGroups)
        .values({ name: args.name, url: args.url, sortOrder: order })
        .returning({ id: schema.posterGroups.id });
      ctx.invalidateQueries();
      return { ok: true as const, id: result[0]?.id ?? 0 };
    },
  }),

  adminPosterDeleteGroup: defineAction({
    description: "Admin: removes a group from the posting list.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.posterGroups).where(eq(schema.posterGroups.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminPosterReset: defineAction({
    description: "Admin: marks every group not-done again (restarts the posting run).",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db.update(schema.posterGroups).set({ done: 0, doneAt: null });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminPosterListAccounts: defineAction({
    description: "Admin: lists poster accounts (name, phone, approval status) for approval.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({ posters: z.array(posterProfileShape) }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.posters)
        .orderBy(desc(schema.posters.createdAt));
      return { posters: rows.map(toPosterProfile) };
    },
  }),

  adminPosterSetAccountStatus: defineAction({
    description: "Admin: approves, rejects, or re-pends a poster account.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
      status: posterStatusEnum,
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.posters)
        .set({ status: args.status, updatedAt: new Date() })
        .where(eq(schema.posters.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminPosterDeleteAccount: defineAction({
    description: "Admin: deletes a poster account and its sessions.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      id: z.number().int().positive(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.posterSessions).where(eq(schema.posterSessions.posterId, args.id));
      await db.delete(schema.posters).where(eq(schema.posters.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
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

  // ---------------- Chatbot training (admin panel "AI প্রশিক্ষণ") ------
  // Admin-taught question–answer pairs, stored as JSON in the settings
  // table (key chat_training_qa). The AI reads them into its system
  // prompt on every reply (see generateAiReply). Until the admin saves
  // their own pairs, the defaults in server/src/chatTraining.ts apply
  // (isDefault: true). Saving an empty list clears the setting back
  // to the defaults; reset does the same.

  adminChatTrainingList: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: returns the chatbot's training question–answer pairs — the admin's saved pairs, or the defaults when none are saved.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: z.object({ qa: z.array(trainingQaShape), isDefault: z.boolean() }),
    async handler(ctx, args) {
      await checkPasscode(ctx, args.passcode);
      const qa = await loadTrainingQA(ctx);
      const stored = parseTrainingQA(await getSetting(ctx, CHAT_TRAINING_SETTING_KEY));
      return { qa, isDefault: stored.length === 0 };
    },
  }),

  adminChatTrainingSave: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: saves the chatbot's training question–answer pairs (max 100). An empty list clears back to the defaults.",
    request: z.object({
      passcode: z.string().min(1).max(60),
      qa: z.array(trainingQaShape).max(100),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      await setSetting(
        ctx,
        CHAT_TRAINING_SETTING_KEY,
        args.qa.length > 0 ? JSON.stringify(args.qa) : "",
      );
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminChatTrainingReset: defineAction({
    privileged: ADMIN_PRIVILEGED,
    description: "Admin: clears the saved training pairs so the chatbot goes back to the default answers.",
    request: z.object({ passcode: z.string().min(1).max(60) }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      await checkPasscode(ctx, args.passcode);
      await setSetting(ctx, CHAT_TRAINING_SETTING_KEY, "");
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
