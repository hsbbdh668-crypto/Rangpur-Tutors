// Vercel API route: POST /api/admin — all admin operations in one route.
// Body: { action, passcode, ...args }. The passcode is checked against the
// ADMIN_PASSCODE environment variable (see lib/db.ts) — never hard-coded.
//
// Actions: verify, stats, listPosts, setPostStatus, setPostFlags,
// updatePost, deletePost, listApplications, setApplicationStatus,
// setCommission, deleteApplication, listReports, setReportStatus,
// updateSettings, chatList, chatGet, chatReply, chatSetMode.
import { checkPasscode, ensureSchema, expectedPasscode, getDb, getSetting, setSetting } from "../lib/db.js";
import { applicationCounts, badRequest, json, num, readBody, str, strList, toPost, validPhone } from "../lib/posts.js";
import { listPosterGroups, toPosterGroup } from "../lib/poster.js";

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
        const id = num(b.id) ?? Number(b.id);
        // Load the current row so fields the caller does not send are kept,
        // never dropped.
        const cur = await db.execute({ sql: "SELECT * FROM posts WHERE id = ? LIMIT 1", args: [id] });
        const row = cur.rows[0] as Record<string, unknown> | undefined;
        const pickStr = (key: string, fallback: unknown) =>
          key in b ? str(b[key]) : String(fallback ?? "");
        const pickEnum = (key: string, allowed: string[], fallback: unknown) =>
          key in b && allowed.includes(str(b[key])) ? str(b[key]) : String(fallback ?? allowed[0]);
        const pickList = (key: string, fallback: unknown) =>
          Array.isArray(b[key]) ? JSON.stringify(strList(b[key]).slice(0, 12)) : String(fallback ?? "[]");
        const pickNum = (key: string, fallback: unknown) =>
          key in b ? num(b[key]) : fallback == null ? null : Number(fallback);
        await db.execute({
          sql: `UPDATE posts SET title = ?, author_name = ?, phone = ?, subjects = ?, classes = ?,
            area = ?, address_note = ?, salary_min = ?, salary_max = ?, salary_negotiable = ?,
            days_per_week = ?, mode = ?, medium = ?, gender_pref = ?, student_gender = ?,
            description = ?, institution = ?, experience = ?, availability = ?, updated_at = ?
            WHERE id = ?`,
          args: [
            str(b.title).trim(),
            str(b.authorName).trim(),
            phone,
            pickList("subjects", row?.subjects),
            pickList("classes", row?.classes),
            str(b.area).trim(),
            pickStr("addressNote", row?.address_note),
            num(b.salaryMin),
            num(b.salaryMax),
            b.salaryNegotiable === true ? 1 : 0,
            pickNum("daysPerWeek", row?.days_per_week),
            pickEnum("mode", ["home", "online", "both"], row?.mode),
            pickEnum("medium", ["bangla", "english", "both"], row?.medium),
            pickEnum("genderPref", ["any", "male", "female"], row?.gender_pref),
            pickEnum("studentGender", ["any", "male", "female"], row?.student_gender),
            str(b.description),
            pickStr("institution", row?.institution),
            pickStr("experience", row?.experience),
            pickStr("availability", row?.availability),
            Date.now(),
            id,
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
              // Commission record (tracking only): amount starts NULL —
              // no commission rate is set, the admin fills it in.
              commissionAmount:
                r.commission_amount == null ? null : Number(r.commission_amount),
              commissionStatus: String(r.commission_status ?? "pending"),
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
        const id = num(b.id) ?? Number(b.id);
        if (status === "accepted") {
          // Accepting creates the commission record: status pending,
          // amount NULL — unless already paid/waived, which is kept.
          const cur = await db.execute({
            sql: "SELECT commission_status FROM applications WHERE id = ? LIMIT 1",
            args: [id],
          });
          const curStatus = String(cur.rows[0]?.commission_status ?? "pending");
          if (curStatus === "paid" || curStatus === "waived") {
            await db.execute({
              sql: "UPDATE applications SET status = 'accepted' WHERE id = ?",
              args: [id],
            });
          } else {
            await db.execute({
              sql: "UPDATE applications SET status = 'accepted', commission_status = 'pending' WHERE id = ?",
              args: [id],
            });
          }
        } else {
          await db.execute({
            sql: "UPDATE applications SET status = ? WHERE id = ?",
            args: [status, id],
          });
        }
        return json({ ok: true });
      }

      case "setCommission": {
        const id = num(b.id) ?? Number(b.id);
        const sets: string[] = [];
        const args: (string | number | null)[] = [];
        if (b.amount !== undefined) {
          // Amount in BDT; null clears it back to empty (not set).
          const amount = b.amount === null ? null : num(b.amount);
          if (b.amount !== null && (amount === null || amount < 0)) {
            return badRequest("কমিশনের পরিমাণ ঠিক নেই");
          }
          sets.push("commission_amount = ?");
          args.push(amount);
        }
        if (b.status !== undefined) {
          const cs = str(b.status);
          if (cs !== "pending" && cs !== "paid" && cs !== "waived") {
            return badRequest("কমিশনের স্ট্যাটাস ঠিক নেই");
          }
          sets.push("commission_status = ?");
          args.push(cs);
        }
        if (sets.length === 0) return json({ ok: true });
        args.push(id);
        await db.execute({
          sql: `UPDATE applications SET ${sets.join(", ")} WHERE id = ?`,
          args,
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

      // -------- Facebook group posting (/poster) --------
      // The group list + post text the admin manages; the poster only
      // sees them after approval (see api/poster.ts). Demo groups/text
      // are seeded once in lib/db.ts and can be edited/deleted here.

      case "posterList": {
        return json({
          postText: await getSetting("poster_post_text"),
          groups: (await listPosterGroups()).map(toPosterGroup),
        });
      }

      case "posterSetText": {
        const text = str(b.text).slice(0, 5000);
        await setSetting("poster_post_text", text);
        return json({ ok: true });
      }

      case "posterAddGroup": {
        const name = str(b.name).trim();
        const url = str(b.url).trim();
        if (name.length < 1 || name.length > 120) return badRequest("গ্রুপের নাম লিখুন");
        if (!/^https?:\/\/.{4,500}$/.test(url)) return badRequest("সঠিক গ্রুপের লিংক দিন");
        const maxRow = await db.execute("SELECT MAX(sort_order) AS m FROM poster_groups");
        const order = Number(maxRow.rows[0]?.m ?? 0) + 1;
        const rs = await db.execute({
          sql: "INSERT INTO poster_groups (name, url, done, done_at, sort_order, created_at) VALUES (?, ?, 0, NULL, ?, ?)",
          args: [name, url, order, Date.now()],
        });
        return json({ ok: true, id: Number(rs.lastInsertRowid ?? 0) });
      }

      case "posterDeleteGroup": {
        await db.execute({
          sql: "DELETE FROM poster_groups WHERE id = ?",
          args: [num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "posterReset": {
        await db.execute("UPDATE poster_groups SET done = 0, done_at = NULL");
        return json({ ok: true });
      }

      case "posterListAccounts": {
        const rs = await db.execute(
          "SELECT id, name, phone, status, created_at FROM posters ORDER BY created_at DESC",
        );
        return json({
          posters: rs.rows.map((r) => ({
            id: Number(r.id),
            name: String(r.name ?? ""),
            phone: String(r.phone ?? ""),
            status: String(r.status ?? "pending"),
            createdAt: new Date(Number(r.created_at ?? Date.now())).toISOString(),
          })),
        });
      }

      case "posterSetAccountStatus": {
        const status = str(b.status);
        if (!["pending", "approved", "rejected"].includes(status)) {
          return badRequest("স্ট্যাটাস ঠিক নেই");
        }
        await db.execute({
          sql: "UPDATE posters SET status = ?, updated_at = ? WHERE id = ?",
          args: [status, Date.now(), num(b.id) ?? Number(b.id)],
        });
        return json({ ok: true });
      }

      case "posterDeleteAccount": {
        const id = num(b.id) ?? Number(b.id);
        await db.batch(
          [
            { sql: "DELETE FROM poster_sessions WHERE poster_id = ?", args: [id] },
            { sql: "DELETE FROM posters WHERE id = ?", args: [id] },
          ],
          "write",
        );
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
