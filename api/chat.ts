// Vercel API routes for the live chat:
//   POST /api/chat            { action: "start", visitorName, visitorPhone, lang }
//   POST /api/chat            { action: "send", conversationId, body, lang }
//   GET  /api/chat?id=…       poll a conversation
//
// AI replies use Groq (free, OpenAI-compatible) configured ONLY through
// env vars: GROQ_API_KEY (get one free at console.groq.com — no card).
// Primary model: openai/gpt-oss-120b (best, human-like replies; free
// tier approx 1,000 requests/day). When it rate-limits (HTTP 429) or errors,
// the route automatically falls back to openai/gpt-oss-20b, so the chat
// never stops. AI_API_URL / AI_MODEL / AI_FALLBACK_MODEL can override the
// endpoint and models. When the AI is
// off, the admin has taken the chat over, the topic is sensitive, or no
// AI key is configured, the message is flagged for the admin instead —
// the AI never decides money or verification matters.
import { getDb, ensureSchema, getSetting } from "../lib/db";
import { badRequest, json, readBody, str } from "../lib/posts";

interface ChatMsg {
  id: number;
  conversationId: number;
  sender: string;
  body: string;
  createdAt: string;
}

async function loadMessages(conversationId: number): Promise<ChatMsg[]> {
  const rs = await getDb().execute({
    sql: "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
    args: [conversationId],
  });
  return rs.rows.map((r) => ({
    id: Number(r.id),
    conversationId: Number(r.conversation_id),
    sender: String(r.sender),
    body: String(r.body),
    createdAt: new Date(Number(r.created_at)).toISOString(),
  }));
}

async function loadConversation(id: number) {
  const rs = await getDb().execute({
    sql: "SELECT * FROM chat_conversations WHERE id = ? LIMIT 1",
    args: [id],
  });
  return rs.rows[0] ?? null;
}

const SENSITIVE: RegExp[] = [
  /বিকাশ|নগদ|রকেট|উপায়/,
  /টাকা\s*(পাঠা|দেব|দিব|পাঠিয়ে|ফেরত|চাই)|আগাম\s*টাকা|অগ্রিম/,
  /পেমেন্ট\s*(কর|করব|দেব)|রিফান্ড|ফেরত\s*দিন|প্রতারণা|প্রতারক|ধোঁকা/,
  /ভেরিফাই\s*(করে\s*দিন|করুন|চাই)|ভেরিফিকেশন\s*(করে|চাই)|অনুমোদন\s*(করে\s*দিন|করুন|চাই)/,
  /\bbkash\b|\bnagad\b|\brocket\b|\brefund/i,
  /\b(send|sent|pay|paid|payment|transfer)\b[^.?!]{0,40}\b(money|taka|tk|৳)\b/i,
  /\b(money|taka)\b[^.?!]{0,40}\b(send|sent|pay|paid|transfer|refund)\b/i,
  /\b(scam|fraud|cheat(ed)?|stole|advance payment)\b/i,
  /\b(verify|approve)\b[^.?!]{0,30}\b(me|my|post|account)\b/i,
];

const SYSTEM_PROMPT = `You are the friendly assistant of "Baraka Tutors" (বারাকা টিউটরস), a tuition board for Rangpur, Bangladesh, where guardians post tuition requests and tutors post tuition offers.

How to talk:
- Talk like a warm, helpful human friend — never robotic, never canned or repetitive. Always reply in the SAME language and script the visitor just used, and stay entirely in that script: Bangla script (বাংলা) gets a reply written only in Bangla script, Roman Bengali / Banglish (Bengali written in English letters, e.g. "amar ekta tutor lagbe") gets a reply written ONLY in Latin letters with no Bangla-script characters at all, in the same Roman Bengali style, for example "Post tab-e giye Guardian select koro, tarpor naam, mobile number, subject ar area likhe Submit chap dao" — do not answer in plain English when the visitor wrote Banglish. Never force English when the visitor wrote Bengali in either script, and never mix scripts in one reply.
- Remember everything said earlier in this conversation and build on it — refer back to what the visitor already told you (their class, subject, area, whether they are a guardian or a tutor) instead of asking again.
- Be organised: answer the question first, then add the one helpful next step. When something important is missing (e.g. which class, which area of Rangpur, home or online), ask ONE friendly follow-up question, the way a person would.
- Keep most replies conversational (2–6 sentences). Use a short list only when it genuinely helps. Plain text, no markdown tables.
- Only describe things this site actually has: the Board and Post tabs, no accounts, no login or sign-up, no dashboard, and the live site is barakatutors.vercel.app. Never invent a login page, a different website address, or a feature that is not listed under "What you know".

What you know:
- The Board tab lists approved posts: guardians looking for tutors and tutors offering tuition. Posting is free from the "Post" tab — choose guardian or tutor, give name, mobile number, title, subjects, classes, Rangpur area and salary; new posts appear after admin approval unless auto-approve is on.
- To contact a poster: tap Call on the card, or open the post and send an application with name + mobile number. The heart button saves posts to Favourites. Bad posts can be reported from the detail view.
- Subjects: Mathematics, Higher Mathematics, English, Bangla, Physics, Chemistry, Biology, General Science, ICT, Accounting, Finance, Economics, Arabic and more. Classes: Play–Nursery up to Class 12 (HSC) and admission preparation. Areas: all of Rangpur — Lalbag, Dhap, Shapla Chattar, Medical Mor, College Para, Kamalkachna, Mahiganj, Tajhat, Haragach, Mithapukur, Badarganj, Pirganj, Pirgachha, Kaunia, Gangachara, Taraganj — plus online anywhere.
- Salary/fees are set by each poster on their post and are often negotiable; point to the specific post's salary and explain ranges only in general terms. Never promise a specific fee for a specific person.
- A "Verified tutor" badge is given only by the admin after checking.

Hard limits:
- Never ask for or handle money, payments, bKash/Nagad numbers, passwords or OTPs. Never promise to verify, approve or reject anyone or any post — the admin decides those (the system escalates automatically).
- If you honestly don't know something specific (a post's phone number, an approval status), say so warmly and suggest checking the Board or waiting for the admin in this chat.`;

async function callGroq(
  key: string,
  url: string,
  model: string,
  messages: { role: string; content: string }[],
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.7 }),
    });
    if (!res.ok) return null; // 429 (rate limit) or any error → caller falls back
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return text ? text.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

async function aiReply(history: ChatMsg[]): Promise<string | null> {
  const key =
    process.env.GROQ_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  if (!key) return null;
  const url = process.env.AI_API_URL ?? "https://api.groq.com/openai/v1/chat/completions";
  const primary = process.env.AI_MODEL ?? "openai/gpt-oss-120b";
  const fallback = process.env.AI_FALLBACK_MODEL ?? "openai/gpt-oss-20b";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-14).map((m) => ({
      role: m.sender === "visitor" ? "user" : "assistant",
      content: m.body,
    })),
  ];
  // Primary: GPT-OSS 120B — best quality, human-like.
  const first = await callGroq(key, url, primary, messages);
  if (first) return first;
  // Fallback: GPT-OSS 20B — keeps the chat alive when the 120B daily
  // limit (1,000 req/day) is used up.
  if (fallback !== primary) return callGroq(key, url, fallback, messages);
  return null;
}

function welcome(lang: string): string {
  return lang === "en"
    ? "Hello! I'm the Baraka Tutors assistant. Ask me how to post a tuition, find a tutor, or anything about tuition in Rangpur."
    : "আসসালামু আলাইকুম! আমি বারাকা টিউটরসের সহকারী। টিউশন পোস্ট করা, টিউটর খোঁজা বা রংপুরের টিউশন নিয়ে যেকোনো প্রশ্ন করুন।";
}

function escalation(lang: string): string {
  return lang === "en"
    ? "This is about money or verification, so I can't decide it myself — I've passed your message to the admin, who will reply here. Please don't send money to anyone in the meantime."
    : "এটা টাকা-পয়সা বা ভেরিফিকেশনের বিষয়, তাই আমি নিজে সিদ্ধান্ত নিতে পারি না — আপনার বার্তাটি অ্যাডমিনের কাছে পাঠিয়ে দিয়েছি, তিনি এখানেই রিপ্লাই করবেন। এর মধ্যে অনুগ্রহ করে কাউকে টাকা পাঠাবেন না।";
}

function fallback(lang: string): string {
  return lang === "en"
    ? "Sorry, I couldn't answer just now. I've flagged this chat for the admin, who will reply here."
    : "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারলাম না। চ্যাটটি অ্যাডমিনের জন্য চিহ্নিত করে রেখেছি — তিনি এখানেই রিপ্লাই করবেন।";
}

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const id = Number(new URL(req.url).searchParams.get("id") ?? 0);
    if (!id) return badRequest("আইডি পাওয়া যায়নি");
    const conv = await loadConversation(id);
    if (!conv) return json({ messages: [], mode: "ai", aiEnabled: false, needsAdmin: false });
    return json({
      messages: await loadMessages(id),
      mode: String(conv.mode),
      aiEnabled: (await getSetting("chat_ai_enabled")) !== "0",
      needsAdmin: Number(conv.needs_admin) === 1,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const action = str(b.action);
    const lang = str(b.lang) === "en" ? "en" : "bn";
    const db = getDb();

    if (action === "start") {
      const now = Date.now();
      const rs = await db.execute({
        sql: "INSERT INTO chat_conversations (visitor_name, visitor_phone, created_at, updated_at) VALUES (?, ?, ?, ?)",
        args: [str(b.visitorName).slice(0, 60), str(b.visitorPhone).slice(0, 20), now, now],
      });
      const id = Number(rs.lastInsertRowid ?? 0);
      const enabled = (await getSetting("chat_ai_enabled")) !== "0";
      if (enabled) {
        await db.execute({
          sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'ai', ?, ?)",
          args: [id, welcome(lang), Date.now()],
        });
      }
      return json({ conversationId: id, aiEnabled: enabled, messages: await loadMessages(id) });
    }

    if (action === "send") {
      const conversationId = typeof b.conversationId === "number" ? b.conversationId : Number(b.conversationId);
      const body = str(b.body).trim();
      if (!conversationId) return badRequest("চ্যাটটি পাওয়া যাচ্ছে না");
      if (!body) return badRequest("বার্তা লিখুন");
      const conv = await loadConversation(conversationId);
      if (!conv) return badRequest("চ্যাটটি পাওয়া যাচ্ছে না");
      await db.execute({
        sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'visitor', ?, ?)",
        args: [conversationId, body.slice(0, 1000), Date.now()],
      });
      await db.execute({
        sql: "UPDATE chat_conversations SET updated_at = ? WHERE id = ?",
        args: [Date.now(), conversationId],
      });

      const enabled = (await getSetting("chat_ai_enabled")) !== "0";
      let needsAdmin = Number(conv.needs_admin) === 1;
      if (enabled && String(conv.mode) === "ai") {
        if (SENSITIVE.some((re) => re.test(body))) {
          needsAdmin = true;
          await db.execute({
            sql: "UPDATE chat_conversations SET needs_admin = 1, updated_at = ? WHERE id = ?",
            args: [Date.now(), conversationId],
          });
          await db.execute({
            sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'ai', ?, ?)",
            args: [conversationId, escalation(lang), Date.now()],
          });
        } else {
          const history = await loadMessages(conversationId);
          const reply = await aiReply(history);
          if (reply) {
            await db.execute({
              sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'ai', ?, ?)",
              args: [conversationId, reply, Date.now()],
            });
          } else {
            needsAdmin = true;
            await db.execute({
              sql: "UPDATE chat_conversations SET needs_admin = 1, updated_at = ? WHERE id = ?",
              args: [Date.now(), conversationId],
            });
            await db.execute({
              sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'ai', ?, ?)",
              args: [conversationId, fallback(lang), Date.now()],
            });
          }
        }
      }
      return json({
        messages: await loadMessages(conversationId),
        mode: String(conv.mode),
        aiEnabled: enabled,
        needsAdmin,
      });
    }

    return badRequest("অজানা অ্যাকশন");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
