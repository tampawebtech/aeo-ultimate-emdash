// Verifies the indexing report against the REAL test-site database, shaping
// rows exactly as ctx.content.list would: `seo` is undefined when has_seo = 0.
import { DatabaseSync } from "node:sqlite";
import { buildIndexingReport, inferSeoEnabled, renderIndexingBlocks, type AuditCollection } from "./report.ts";

const db = new DatabaseSync("C:/Users/jades/Desktop/aeo ultimate emdash/testsite/data.db");
const hasSeo = new Map<string, number>(
  db.prepare("select slug, has_seo from _emdash_collections").all().map((r: any) => [r.slug, r.has_seo]),
);

function listCollection(slug: string): AuditCollection {
  const table = `ec_${slug}`;
  const rows: any[] = db.prepare(`select id, slug, status, title from ${table}`).all();
  const seoOn = hasSeo.get(slug) === 1;
  const seoRows = new Map<string, number>(
    db.prepare("select content_id, seo_no_index from _emdash_seo where collection = ?").all(slug).map((r: any) => [r.content_id, r.seo_no_index]),
  );
  const items = rows.map((r) => ({
    id: r.id, slug: r.slug, status: r.status, title: r.title,
    // Mirrors core: undefined for non-SEO collections.
    seo: seoOn ? { noIndex: seoRows.get(r.id) === 1 } : undefined,
  }));
  return {
    slug,
    readable: true,
    seoEnabled: inferSeoEnabled(items),
    entries: items.map((i) => ({ id: i.id, slug: i.slug, status: i.status, title: i.title, noIndex: i.seo?.noIndex })),
  };
}

const collections = [listCollection("posts"), listCollection("pages"), { slug: "products", readable: false, seoEnabled: false, entries: [] }];
const report = buildIndexingReport(collections);
console.log("REPORT:", JSON.stringify({ ...report, hidden: report.hidden.length }, null, 1));
console.log("\n--- BLOCKS ---");
for (const b of renderIndexingBlocks(report).blocks) {
  if (b.type === "banner") console.log(`[${b.variant}] ${b.title}\n    ${b.description}`);
  else if (b.type === "header") console.log(`# ${b.text}`);
  else if (b.type === "fields") console.log((b.fields as any[]).map(f => `${f.label}: ${f.value}`).join("  |  "));
  else if (b.type === "table") console.log(`TABLE rows=${(b.rows as any[]).length} empty="${b.empty_text}"`, JSON.stringify(b.rows));
  else if (b.type === "context") console.log(`(${b.text})`);
}
