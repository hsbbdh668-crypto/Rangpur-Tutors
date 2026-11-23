// Vercel API route: /api/saved-searches
//   GET    — list saved filter presets
//   POST   — save one { label, filters }
//   DELETE — remove one { id } (or ?id=)
import { getDb, ensureSchema } from "../lib/db.js";
import { badRequest, json, readBody, str } from "../lib/posts.js";

export async function GET(): Promise<Response> {
  try {
    await ensureSchema();
    const rs = await getDb().execute("SELECT * FROM saved_searches ORDER BY id DESC");
    const searches = rs.rows.map((r) => {
      let filters: Record<string, unknown> = { sort: "newest" };
      try {
        const parsed: unknown = JSON.parse(String(r.filters_json ?? "{}"));
        if (parsed != null && typeof parsed === "object") {
          filters = parsed as Record<string, unknown>;
        }
      } catch {
        /* keep default */
      }
      return {
        id: Number(r.id),
        label: String(r.label ?? ""),
        filters,
        createdAt: new Date(Number(r.created_at ?? Date.now())).toISOString(),
      };
    });
    return json({ searches });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const b = await readBody(req);
    const label = str(b.label).trim();
    if (!label) return badRequest("খোঁজের একটি নাম দিন");
    const filters =
      b.filters != null && typeof b.filters === "object" ? b.filters : { sort: "newest" };
    const rs = await getDb().execute({
      sql: "INSERT INTO saved_searches (label, filters_json, created_at) VALUES (?, ?, ?)",
      args: [label.slice(0, 60), JSON.stringify(filters), Date.now()],
    });
    return json({ id: Number(rs.lastInsertRowid ?? 0) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("id");
    const b = fromQuery ? {} : await readBody(req);
    const id = fromQuery ? Number(fromQuery) : typeof b.id === "number" ? b.id : Number(b.id);
    if (!id) return badRequest("আইডি পাওয়া যায়নি");
    await getDb().execute({ sql: "DELETE FROM saved_searches WHERE id = ?", args: [id] });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
