// Vercel API route: /api/sitemap (rewritten from /sitemap.xml)
//
// Real dynamic sitemap: the static pages (home, board, jobs, fee guide,
// the 9 area pages) plus one URL per approved tuition post (/post/<id>),
// read live from the Turso database so new posts appear automatically.
// Before this route existed, /sitemap.xml returned the SPA homepage HTML
// (the catch-all rewrite), which crawlers cannot use.
import { getDb, ensureSchema } from "../lib/db.js";

const SITE = "https://barakatutors.vercel.app";

const AREA_SLUGS = [
  "dhap",
  "lalbagh",
  "modern-mor",
  "rangpur-sadar",
  "jummapara",
  "babukha",
  "shapla-chattar",
  "mahiganj",
  "kamarpara",
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const db = getDb();
    const rs = await db.execute(
      "SELECT id, updated_at FROM posts WHERE status = 'approved' ORDER BY id ASC",
    );

    const urls: { loc: string; lastmod?: string; priority: string }[] = [
      { loc: `${SITE}/`, priority: "1.0" },
      { loc: `${SITE}/board`, priority: "0.9" },
      { loc: `${SITE}/jobs`, priority: "0.8" },
      { loc: `${SITE}/fees`, priority: "0.8" },
      ...AREA_SLUGS.map((slug) => ({
        loc: `${SITE}/area/${slug}`,
        priority: "0.7",
      })),
    ];
    for (const row of rs.rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const updated = Number(row.updated_at);
      urls.push({
        loc: `${SITE}/post/${id}`,
        lastmod:
          Number.isFinite(updated) && updated > 0
            ? new Date(updated).toISOString().slice(0, 10)
            : undefined,
        priority: "0.6",
      });
    }

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url>\n    <loc>${esc(u.loc)}</loc>\n` +
            (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
            `    <priority>${u.priority}</priority>\n  </url>`,
        )
        .join("\n") +
      `\n</urlset>\n`;

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    return new Response(
      `Sitemap unavailable: ${e instanceof Error ? e.message : "error"}`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
