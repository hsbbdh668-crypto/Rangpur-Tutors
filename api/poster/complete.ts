// Vercel API route: POST /api/poster/complete — marks one group done.
// Same action as POST /api/poster { action: "complete" }, as its own
// route. Approved posters only (see api/poster.ts for the gate).
import { ensureSchema } from "../../lib/db.js";
import { badRequest, json, num, readBody } from "../../lib/posts.js";
import {
  listPosterGroups,
  markPosterGroupDone,
  posterTokenFromReq,
  resolvePosterByToken,
  toPosterGroup,
} from "../../lib/poster.js";

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const token = posterTokenFromReq(req, b);
    if (!token) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
    const poster = await resolvePosterByToken(token);
    if (!poster) return json({ error: "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" }, 401);
    if (String(poster.status) !== "approved") {
      return json(
        { error: "অ্যাডমিন এখনো অ্যাপ্রুভ করেনি — অনুমোদনের পর গ্রুপ লিস্ট দেখতে পারবেন" },
        403,
      );
    }
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
