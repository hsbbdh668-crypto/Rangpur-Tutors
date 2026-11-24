// Vercel API route: /api/post-page?id=<id> (rewritten from /post/<id>)
//
// Serves the SPA shell with THIS post's own <title>, meta description,
// canonical and Open Graph tags already in the HTML, so crawlers and
// social shares see "[শ্রেণি] [বিষয়] টিউটর — [এলাকা], রংপুর" instead of
// the generic homepage tags. The shell itself is the deployment's own
// built index.html (fetched from the same origin and cached in memory);
// the client then boots normally and — reading /post/<id> from the URL —
// opens that post's detail view. Any failure falls back to a redirect
// home rather than a broken page.
import { getDb, ensureSchema } from "../lib/db.js";
import { str, strList } from "../lib/posts.js";

const SITE = "https://barakatutors.vercel.app";

let shellCache: string | null = null;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMeta(html: string, attr: "name" | "property", key: string, value: string): string {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, `$1${esc(value)}$2`);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  const home = `${url.origin}/`;
  if (!Number.isFinite(id) || id <= 0) {
    return Response.redirect(home, 302);
  }
  try {
    await ensureSchema();
    const db = getDb();
    const rs = await db.execute({
      sql: "SELECT * FROM posts WHERE id = ? AND status = 'approved' LIMIT 1",
      args: [id],
    });
    const row = rs.rows[0];
    if (!row) return Response.redirect(home, 302);

    const kind = str(row.kind);
    const classes = strList(JSON.parse(str(row.classes, "[]")));
    const subjects = strList(JSON.parse(str(row.subjects, "[]")));
    const area = str(row.area);
    const what = kind === "guardian" ? "টিউটর প্রয়োজন" : "টিউটর";
    const title = `${classes.join(", ")} ${subjects.join(", ")} ${what} — ${area}, রংপুর | Baraka Tutors`;
    const description =
      kind === "guardian"
        ? `${area}, রংপুরে ${classes.join(", ")}-এর জন্য ${subjects.join(", ")} টিউটর প্রয়োজন। পুরো টিউশন পোস্টটি দেখুন ও Baraka Tutors-এ আবেদন করুন।`
        : `${area}, রংপুরে ${classes.join(", ")}-এর ${subjects.join(", ")} হোম টিউটর পাওয়া যাচ্ছে। পুরো টিউটর অফারটি দেখুন ও Baraka Tutors-এ যোগাযোগ করুন।`;
    const postUrl = `${SITE}/post/${id}`;

    if (!shellCache) {
      const shellRes = await fetch(home);
      if (!shellRes.ok) return Response.redirect(home, 302);
      shellCache = await shellRes.text();
    }
    let html = shellCache;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = replaceMeta(html, "name", "description", description);
    html = replaceMeta(html, "property", "og:title", title);
    html = replaceMeta(html, "property", "og:description", description);
    html = replaceMeta(html, "property", "og:url", postUrl);
    html = replaceMeta(html, "property", "og:type", "article");
    html = replaceMeta(html, "name", "twitter:title", title);
    html = replaceMeta(html, "name", "twitter:description", description);
    html = html.replace(
      /(<link rel="canonical" href=")[^"]*(")/,
      `$1${postUrl}$2`,
    );

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch {
    return Response.redirect(home, 302);
  }
}
