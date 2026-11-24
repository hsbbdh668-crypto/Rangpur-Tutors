// Vercel API route: /api/poster — the Facebook group posting task.
//
// Only an APPROVED poster sees anything here. The poster logs in first
// (POST /api/posters) and the token is sent as the `x-poster-token`
// header (or a `token` body field). A pending poster gets a 403 with
// their status, so the client can show "waiting for admin approval";
// a rejected poster gets the same with status "rejected". Nothing
// about the task (group list, post text) leaks before approval.
//
//   GET  /api/poster                 — { postText, groups, doneCount, totalCount }
//   POST /api/poster { action: "complete", groupId } — marks one group done
//   (POST /api/poster/complete is the same action as its own route.)
import { ensureSchema, getSetting } from "../lib/db.js";
import { badRequest, json, num, readBody, str } from "../lib/posts.js";
import {
  listPosterGroups,
  markPosterGroupDone,
  posterTokenFromReq,
  resolvePosterByToken,
  toPosterGroup,
} from "../lib/poster.js";

async function approvedPoster(req: Request, body: Record<string, unknown>) {
  const token = posterTokenFromReq(req, body);
  if (!token) return { poster: null, error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন", status: 401 };
  const poster = await resolvePosterByToken(token);
  if (!poster) return { poster: null, error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন", status: 401 };
  if (String(poster.status) !== "approved") {
    return {
      poster: null,
      error: "অ্যাডমিন এখনো অ্যাপ্রুভ করেনি — অনুমোদনের পর গ্রুপ লিস্ট দেখতে পারবেন",
      status: 403,
    };
  }
  return { poster, error: null, status: 200 };
}

export async function GET(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const gate = await approvedPoster(req, {});
    if (!gate.poster) return json({ error: gate.error }, gate.status);
    const [postText, groups] = await Promise.all([
      getSetting("poster_post_text"),
      listPosterGroups(),
    ]);
    const doneCount = groups.filter((g) => g.done).length;
    return json({ postText, groups, doneCount, totalCount: groups.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const action = str(b.action);
    if (action !== "complete") return badRequest("অজানা অ্যাকশন");
    const gate = await approvedPoster(req, b);
    if (!gate.poster) return json({ error: gate.error }, gate.status);
    const groupId = num(b.groupId) ?? Number(b.groupId);
    if (!groupId) return badRequest("গ্রুপটি পাওয়া যাচ্ছে না");
    const groups = await listPosterGroups();
    if (!groups.some((g) => g.id === groupId)) return badRequest("গ্রুপটি পাওয়া যাচ্ছে না");
    await markPosterGroupDone(groupId);
    const fresh = await listPosterGroups();
    return json({
      ok: true,
      groups: fresh.map(toPosterGroup),
      doneCount: fresh.filter((g) => g.done).length,
      totalCount: fresh.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
