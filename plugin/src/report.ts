/**
 * Indexing report - pure logic.
 *
 * Two things this must never do:
 *
 * 1. Report "nothing hidden" when it actually could not look. A collection
 *    with SEO disabled (`has_seo = 0`) returns entries whose `seo` is
 *    undefined, so a naive filter finds no noindex pages and the panel reads
 *    like an all-clear. The stock blog template ships with SEO off on
 *    `pages`, so that is the default experience, not an edge case.
 *
 * 2. Imply it scanned the whole site. Plugins cannot enumerate collections -
 *    there is no schema access on the plugin context - so the report always
 *    works from a configured list and has to say which list it used.
 */

export interface AuditEntry {
	id: string;
	slug: string | null;
	status: string;
	/** undefined when the collection has SEO disabled - "unknown", not "false". */
	noIndex?: boolean;
	title?: string | null;
	data?: Record<string, unknown>;
	seo?: {
		title?: string | null;
		description?: string | null;
		image?: string | null;
		canonical?: string | null;
		noIndex?: boolean;
	};
}

export interface AuditCollection {
	slug: string;
	/** False when the collection could not be read at all (bad slug, error). */
	readable: boolean;
	/** False when the collection has SEO disabled. */
	seoEnabled: boolean;
	entries: AuditEntry[];
}

export interface HiddenPage {
	collection: string;
	slug: string;
	title: string;
	status: string;
}

export interface IndexingReport {
	/** Collections we successfully read AND that have SEO enabled. */
	checkedCollections: string[];
	/** Collections read, but with SEO off - entries exist and cannot be judged. */
	blindCollections: Array<{ slug: string; entryCount: number }>;
	/** Collections we could not read at all. */
	unreadableCollections: string[];
	/** Entries actually judged. */
	entriesChecked: number;
	/** Entries we could not judge because SEO is off on their collection. */
	entriesUncheckable: number;
	hidden: HiddenPage[];
}

/** Human label for an entry, preferring an explicit title. */
function entryLabel(entry: AuditEntry): string {
	const title = entry.title?.trim();
	if (title) return title;
	return entry.slug || entry.id;
}

export function buildIndexingReport(collections: AuditCollection[]): IndexingReport {
	const report: IndexingReport = {
		checkedCollections: [],
		blindCollections: [],
		unreadableCollections: [],
		entriesChecked: 0,
		entriesUncheckable: 0,
		hidden: [],
	};

	for (const collection of collections) {
		if (!collection.readable) {
			report.unreadableCollections.push(collection.slug);
			continue;
		}

		if (!collection.seoEnabled) {
			report.blindCollections.push({
				slug: collection.slug,
				entryCount: collection.entries.length,
			});
			report.entriesUncheckable += collection.entries.length;
			continue;
		}

		report.checkedCollections.push(collection.slug);
		for (const entry of collection.entries) {
			report.entriesChecked += 1;
			if (entry.noIndex === true) {
				report.hidden.push({
					collection: collection.slug,
					slug: entry.slug || entry.id,
					title: entryLabel(entry),
					status: entry.status,
				});
			}
		}
	}

	return report;
}

/**
 * Decide whether a collection has SEO enabled from the entries returned.
 *
 * `ContentItem.seo` is undefined for collections with `has_seo = 0`. With no
 * entries at all we cannot tell, and we say so by treating it as enabled but
 * empty rather than accusing the merchant of a misconfiguration we did not
 * observe.
 */
export function inferSeoEnabled(entries: Array<{ seo?: unknown }>): boolean {
	if (entries.length === 0) return true;
	return entries.some((entry) => entry.seo !== undefined && entry.seo !== null);
}

type Block = Record<string, unknown>;

/** Render the report as Block Kit blocks for the admin page. */
export function renderIndexingBlocks(report: IndexingReport): { blocks: Block[] } {
	const blocks: Block[] = [{ type: "header", text: "Indexing" }];

	// The blind spots come FIRST. A merchant who reads only the top of the
	// page should learn what we could not see before they read a count.
	for (const blind of report.blindCollections) {
		blocks.push({
			type: "banner",
			variant: "alert",
			title: `SEO is off for "${blind.slug}"`,
			description:
				`${blind.entryCount} ${blind.entryCount === 1 ? "entry" : "entries"} in this collection ` +
				`cannot be checked, and they have no "Hide from search engines" control at all. ` +
				`Turn SEO on under Admin > Content Types > ${blind.slug} ` +
				`(/_emdash/admin/content-types/${blind.slug}), then reload this page.`,
		});
	}

	for (const slug of report.unreadableCollections) {
		blocks.push({
			type: "banner",
			variant: "error",
			title: `Could not read "${slug}"`,
			description: "Check that this collection exists and is listed correctly in settings.",
		});
	}

	blocks.push({
		type: "fields",
		fields: [
			{ label: "Entries checked", value: String(report.entriesChecked) },
			{ label: "Hidden from search engines", value: String(report.hidden.length) },
			{ label: "Could not be checked", value: String(report.entriesUncheckable) },
		],
	});

	blocks.push({
		type: "table",
		columns: [
			{ key: "title", label: "Page" },
			{ key: "collection", label: "Collection" },
			{ key: "status", label: "Status" },
		],
		rows: report.hidden.map((h) => ({
			title: h.title,
			collection: h.collection,
			status: h.status,
		})),
		page_action_id: "indexing_hidden",
		empty_text:
			report.entriesChecked === 0
				? "Nothing could be checked yet."
				: "No pages are hidden from search engines.",
	});

	const checked = report.checkedCollections;
	blocks.push({
		type: "context",
		text: checked.length
			? `Checked: ${checked.join(", ")}. Collections are read from this plugin's settings - EmDash does not let a plugin list them itself, so anything not in that list was not examined.`
			: "No collections could be checked. Add the collections you want audited in this plugin's settings.",
	});

	return { blocks };
}
