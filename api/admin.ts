// Vercel API route: POST /api/admin — all admin operations in one route.
// Body: { action, passcode, ...args }. The passcode is checked against the
// ADMIN_PASSCODE environment variable (see lib/db.ts) — never hard-coded.
//
// Actions: verify, stats, listPosts, setPostStatus, setPostFlags,
// updatePost, deletePost, listApplications, setApplicationStatus,
// deleteApplication, listReports, setReportStatus, updateSettings,
// chatList, chatGet, chatReply, chatSetMode.
import { checkPasscode, ensureSchema, expectedPasscode, getDb, getSetting, setSetting } from "../lib/db";
import { applicationCounts, badRequest, json, num, readBody, str, toPost, validPhone } from "../lib/posts";

const UNAUTHORIZED = () => json({ error: "ভুল পাসকোড — আবার চেষ্টা করুন" }, 401);

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const action = str(b.action);
    const passcode = str(b.passcode);
    const db = getDb();

    if (action === "verify") {
      return json({ ok: await checkPasscode(passcode) });
    }
    // One-time deploy setup (Hatch `bootstrapAdminPasscode` action): stores
    // the first admin passcode when none is configured yet (no
    // ADMIN_PASSCODE env var and nothing saved). Runs before the passcode
    // check below — there is no passcode to check against yet — and is a
    // no-op once a passcode exists.
    if (action === "bootstrap") {
      if (await expectedPasscode()) return json({ configured: true, alreadySet: true });
      const newPasscode = str(b.newPasscode).trim();
      if (newPasscode.length < 4) return badRequest("নতুন পাসকোড অন্তত ৪ অক্ষরের হতে হবে");
      await setSetting("admin_passcode", newPasscode);
      return json({ configured: true, alreadySet: false });
    }
    if (!(await checkPasscode(passcode))) return UNAUTHORIZED();

    switch (action) {
      case "stats": {
        const posts = await db.execute("SELECT status, kind FROM posts");
        const apps = await db.execute("SELECT status FROM applications");
        const reps = await db.execute("SELECT status FROM reports");
        const favs = await db.execute("SELECT COUNT(*) AS c FROM favorites");
        const by = (rows: Record<string, unknown>[], v: string) =>
          rows.filter((r) => r.status === v).length;
        return json({
          pending: by(posts.rows, "pending"),
          approved: by(posts.rows, "approved"),
          rejected: by(posts.rows, "rejected"),
          closed: by(posts.rows, "closed"),
          guardianPosts: posts.rows.filter((r) => r.kind === "guardian").length,
          tutorPosts: posts.rows.filter((r) => r.kind === "tutor").length,
          applications: apps.rows.length,
          newApplications: by(apps.rows, "new"),
          openReports: by(reps.rows, "open"),
          favorites: Number(favs.rows[0]?.c ?? 0),
        });
      }

      case "listPosts": {
        const rs = await db.execute("SELECT * FROM posts ORDER BY created_at DESC LIMIT 300");
        const counts = await applicationCounts();
        let posts = rs.rows.map((r) => toPost(r, counts.get(Number(r.id)) ?? 0));
        const status = str(b.status);
        const kind = str(b.kind);
        if (status) posts = posts.filter((p) => p.status === status);
        if (kind) posts = posts.filter((p) => p.kind === kind);
        return json({ posts });
      }

      case "setPostStatus": {
        const status = str(b.status);
        if (!["pending", "approved", "rejected", "closed"].includes(status)) {
          return badRequest("স্ট্যাটাস ঠিক নেই");
        }
        await db.execute({
          sql: "UPDATE posts SET status = ?, updated_at = ? WHERE id = ?",
          args: [status, Date.now(), num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "setPostFlags": {
        const sets: string[] = ["updated_at = ?"];
        const args: unknown[] = [Date.now()];
        if (typeof b.featured === "boolean") {
          sets.push("featured = ?");
          args.push(b.featured ? 1 : 0);
        }
        if (typeof b.verified === "boolean") {
          sets.push("verified = ?");
          args.push(b.verified ? 1 : 0);
        }
        args.push(num(b.id) ?? Number(b.id));
        await db.execute({ sql: `UPDATE posts SET ${sets.join(", ")} WHERE id = ?`, args });
        return json({ ok: true });
      }

      case "updatePost": {
        const phone = str(b.phone).trim();
        if (!validPhone(phone)) return badRequest("সঠিক মোবাইল নম্বর দিন");
        await db.execute({
          sql: `UPDATE posts SET title = ?, author_name = ?, phone = ?, area = ?,
            salary_min = ?, salary_max = ?, salary_negotiable = ?, description = ?, updated_at = ?
            WHERE id = ?`,
          args: [
            str(b.title).trim(),
            str(b.authorName).trim(),
            phone,
            str(b.area).trim(),
            num(b.salaryMin),
            num(b.salaryMax),
            b.salaryNegotiable === true ? 1 : 0,
            str(b.description),
            Date.now(),
            num(b.id) ?? Number(b.id),
          ],
        });
        return json({ ok: true });
      }

      case "deletePost": {
        const id = num(b.id) ?? Number(b.id);
        await db.batch(
          [
            { sql: "DELETE FROM applications WHERE post_id = ?", args: [id] },
            { sql: "DELETE FROM reports WHERE post_id = ?", args: [id] },
            { sql: "DELETE FROM favorites WHERE post_id = ?", args: [id] },
            { sql: "DELETE FROM posts WHERE id = ?", args: [id] },
          ],
          "write",
        );
        return json({ ok: true });
      }

      case "listApplications": {
        const rs = await db.execute(
          "SELECT * FROM applications ORDER BY created_at DESC LIMIT 300",
        );
        const posts = await db.execute("SELECT id, title, kind FROM posts");
        const byId = new Map(posts.rows.map((p) => [Number(p.id), p]));
        return json({
          applications: rs.rows.map((r) => {
            const post = byId.get(Number(r.post_id));
            return {
              id: Number(r.id),
              postId: Number(r.post_id),
              postTitle: post ? String(post.title) : "(মুছে ফেলা পোস্ট)",
              postKind: post ? String(post.kind) : null,
              applicantName: String(r.applicant_name),
              applicantPhone: String(r.applicant_phone),
              applicantRole: String(r.applicant_role),
              message: String(r.message ?? ""),
              status: String(r.status),
              createdAt: new Date(Number(r.created_at)).toISOString(),
            };
          }),
        });
      }

      case "setApplicationStatus": {
        const status = str(b.status);
        if (!["new", "contacted", "accepted", "rejected"].includes(status)) {
          return badRequest("স্ট্যাটাস ঠিক নেই");
        }
        await db.execute({
          sql: "UPDATE applications SET status = ? WHERE id = ?",
          args: [status, num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "deleteApplication": {
        await db.execute({
          sql: "DELETE FROM applications WHERE id = ?",
          args: [num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "listReports": {
        const rs = await db.execute("SELECT * FROM reports ORDER BY created_at DESC LIMIT 300");
        const posts = await db.execute("SELECT id, title FROM posts");
        const byId = new Map(posts.rows.map((p) => [Number(p.id), String(p.title)]));
        return json({
          reports: rs.rows.map((r) => ({
            id: Number(r.id),
            postId: Number(r.post_id),
            postTitle: byId.get(Number(r.post_id)) ?? "(মুছে ফেলা পোস্ট)",
            reporterName: String(r.reporter_name ?? ""),
            reason: String(r.reason),
            details: String(r.details ?? ""),
            status: String(r.status),
            createdAt: new Date(Number(r.created_at)).toISOString(),
          })),
        });
      }

      case "setReportStatus": {
        const status = str(b.status);
        if (!["open", "resolved", "dismissed"].includes(status)) {
          return badRequest("স্ট্যাটাস ঠিক নেই");
        }
        await db.execute({
          sql: "UPDATE reports SET status = ? WHERE id = ?",
          args: [status, num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "updateSettings": {
        if (typeof b.notice === "string") await setSetting("notice", b.notice.trim().slice(0, 300));
        if (typeof b.autoApprove === "boolean") {
          await setSetting("auto_approve", b.autoApprove ? "1" : "0");
        }
        if (typeof b.chatAiEnabled === "boolean") {
          await setSetting("chat_ai_enabled", b.chatAiEnabled ? "1" : "0");
        }
        const newPasscode = str(b.newPasscode).trim();
        if (newPasscode) {
          if ((process.env.ADMIN_PASSCODE ?? "").trim()) {
            return badRequest(
              "পাসকোডটি ADMIN_PASSCODE env variable দিয়ে সেট করা — বদলাতে হলে Vercel-এর Environment Variables থেকে বদলান",
            );
          }
          if (newPasscode.length < 4) return badRequest("নতুন পাসকোড অন্তত ৪ অক্ষরের হতে হবে");
          await setSetting("admin_passcode", newPasscode);
        }
        return json({ ok: true });
      }

      case "chatList": {
        const convs = await db.execute(
          "SELECT * FROM chat_conversations ORDER BY updated_at DESC LIMIT 200",
        );
        const msgs = await db.execute("SELECT * FROM chat_messages ORDER BY id ASC");
        const byConv = new Map<number, Record<string, unknown>[]>();
        for (const m of msgs.rows) {
          const list = byConv.get(Number(m.conversation_id)) ?? [];
          list.push(m);
          byConv.set(Number(m.conversation_id), list);
        }
        return json({
          conversations: convs.rows.map((c) => {
            const list = byConv.get(Number(c.id)) ?? [];
            const last = list[list.length - 1];
            return {
              id: Number(c.id),
              visitorName: String(c.visitor_name ?? ""),
              visitorPhone: String(c.visitor_phone ?? ""),
              mode: String(c.mode),
              needsAdmin: Number(c.needs_admin) === 1,
              lastMessage: last ? String(last.body) : "",
              messageCount: list.length,
              createdAt: new Date(Number(c.created_at)).toISOString(),
              updatedAt: new Date(Number(c.updated_at)).toISOString(),
            };
          }),
        });
      }

      case "chatGet": {
        const id = num(b.conversationId) ?? Number(b.conversationId);
        const conv = await db.execute({
          sql: "SELECT * FROM chat_conversations WHERE id = ? LIMIT 1",
          args: [id],
        });
        const row = conv.rows[0];
        if (!row) return json({ conversation: null, messages: [] });
        const msgs = await db.execute({
          sql: "SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC",
          args: [id],
        });
        const messages = msgs.rows.map((m) => ({
          id: Number(m.id),
          conversationId: Number(m.conversation_id),
          sender: String(m.sender),
          body: String(m.body),
          createdAt: new Date(Number(m.created_at)).toISOString(),
        }));
        const last = messages[messages.length - 1];
        return json({
          conversation: {
            id: Number(row.id),
            visitorName: String(row.visitor_name ?? ""),
            visitorPhone: String(row.visitor_phone ?? ""),
            mode: String(row.mode),
            needsAdmin: Number(row.needs_admin) === 1,
            lastMessage: last ? last.body : "",
            messageCount: messages.length,
            createdAt: new Date(Number(row.created_at)).toISOString(),
            updatedAt: new Date(Number(row.updated_at)).toISOString(),
          },
          messages,
        });
      }

      case "chatReply": {
        const id = num(b.conversationId) ?? Number(b.conversationId);
        const body = str(b.body).trim();
        if (!body) return badRequest("বার্তা লিখুন");
        await db.execute({
          sql: "INSERT INTO chat_messages (conversation_id, sender, body, created_at) VALUES (?, 'admin', ?, ?)",
          args: [id, body.slice(0, 1000), Date.now()],
        });
        // Replying takes the chat over: the AI stays silent until handed back.
        await db.execute({
          sql: "UPDATE chat_conversations SET mode = 'admin', needs_admin = 0, updated_at = ? WHERE id = ?",
          args: [Date.now(), id],
        });
        return json({ ok: true });
      }

      case "chatSetMode": {
        const id = num(b.conversationId) ?? Number(b.conversationId);
        const mode = str(b.mode);
        if (mode !== "ai" && mode !== "admin") return badRequest("মোড ঠিক নেই");
        await db.execute({
          sql:
            mode === "ai"
              ? "UPDATE chat_conversations SET mode = 'ai', needs_admin = 0, updated_at = ? WHERE id = ?"
              : "UPDATE chat_conversations SET mode = 'admin', updated_at = ? WHERE id = ?",
          args: [Date.now(), id],
        });
        return json({ ok: true });
      }

      default:
        return badRequest("অজানা অ্যাকশন");
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

// GET /api/admin?action=config — public config used by the board header.
export async function GET(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "config") {
      return json({
        notice: await getSetting("notice"),
        autoApprove: (await getSetting("auto_approve")) === "1",
        passcodeFromEnv: (process.env.ADMIN_PASSCODE ?? "").trim().length > 0,
        chatAiEnabled: (await getSetting("chat_ai_enabled")) !== "0",
      });
    }
    return badRequest("অজানা অ্যাকশন");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
