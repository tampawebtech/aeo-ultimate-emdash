/**
 * AEO Ultimate for EmDash - plugin definition (runs at request time).
 *
 * Declares exactly one capability, content:read, used for two things: the
 * merchant-authored FAQ rows on the page being rendered, and the indexing
 * report's view of the "hide from search engines" flag. No writes, no network,
 * no user or media access. That restraint is deliberate - the marketplace
 * publishes a Security Risk score on the plugin card, and the cheapest way to
 * score low is to genuinely need little.
 */

import { buildAeoGraph, type AeoSettings, type PageLike } from "./graph.ts";
import { extractFaqPairs, type FaqPair } from "./extract.ts";
import { buildSettingsBlocks, formValuesToSettings } from "./settingsForm.ts";
import {
	buildIndexingReport,
	inferSeoEnabled,
	renderIndexingBlocks,
	type AuditCollection,
} from "./report.ts";
import {
	buildSocialAudit,
	renderSocialBlocks,
	type SocialPageOverride,
} from "./socialManager.ts";
import {
	extractSocialDescription,
	extractSocialTitle,
	extractSocialImage,
	detectMissingAlt,
	applyAltTextUpdate,
} from "./contentExtractor.ts";

/** Collections audited when the merchant has not named any. */
const DEFAULT_AUDIT_COLLECTIONS = ["posts", "pages"];

/** Cap per collection so a large site cannot stall the admin request. */
const AUDIT_PAGE_SIZE = 200;

const SETTINGS_KEY = "settings";
const SOCIAL_OVERRIDES_KEY = "social_overrides";

interface MetaContribution {
	kind: "meta";
	name: string;
	content: string;
	key?: string;
}
interface PropertyContribution {
	kind: "property";
	property: string;
	content: string;
	key?: string;
}
interface JsonLdContribution {
	kind: "jsonld";
	id?: string;
	graph: unknown;
}
type Contribution = MetaContribution | PropertyContribution | JsonLdContribution;

/**
 * Read merchant settings, tolerating a cold or empty KV.
 * A failure here must not cost the page its metadata, so we fall back to
 * defaults rather than throwing out of the hook.
 */
async function loadSettings(ctx: { kv?: { get?: (k: string) => Promise<unknown> }; log?: { warn?: (m: string, e?: unknown) => void } }): Promise<AeoSettings> {
	try {
		const raw = await ctx.kv?.get?.(SETTINGS_KEY);
		if (raw && typeof raw === "object") return raw as AeoSettings;
	} catch (error) {
		ctx.log?.warn?.("[aeo] could not read settings, using defaults", error);
	}
	return {};
}

/**
 * Read per-page social overrides from KV.
 */
async function loadSocialOverrides(ctx: { kv?: { get?: (k: string) => Promise<unknown> }; log?: { warn?: (m: string, e?: unknown) => void } }): Promise<Record<string, SocialPageOverride>> {
	try {
		const raw = await ctx.kv?.get?.(SOCIAL_OVERRIDES_KEY);
		if (raw && typeof raw === "object") return raw as Record<string, SocialPageOverride>;
	} catch (error) {
		ctx.log?.warn?.("[aeo] could not read social overrides", error);
	}
	return {};
}

/**
 * Load merchant-authored FAQ rows for the page being rendered.
 *
 * Only runs for content pages, and only reads the one entry already being
 * rendered - never a collection scan on a page render. Any failure degrades
 * to "no FAQ" rather than costing the page its graph.
 */
async function loadFaqPairs(page: PageLike, settings: AeoSettings, ctx: any): Promise<FaqPair[]> {
	const ref = page.content;
	if (!ref?.collection || !ref.id) return [];
	if (!ctx?.content?.get) return [];

	try {
		const item = await ctx.content.get(ref.collection, ref.id);
		if (!item) return [];
		return extractFaqPairs(item.data, {
			fields: settings.faqFields,
			questionKeys: settings.faqQuestionKeys,
			answerKeys: settings.faqAnswerKeys,
		});
	} catch (error) {
		ctx?.log?.warn?.("[aeo] could not read content for FAQ", error);
		return [];
	}
}

/**
 * Read each configured collection and normalise it for audits and reports.
 *
 * A collection that throws is recorded as unreadable rather than skipped
 * silently, because "I could not look" and "there was nothing there" must
 * not render the same way.
 */
async function auditCollections(settings: AeoSettings, ctx: any): Promise<AuditCollection[]> {
	const slugs =
		settings.auditCollections && settings.auditCollections.length > 0
			? settings.auditCollections
			: DEFAULT_AUDIT_COLLECTIONS;

	const results: AuditCollection[] = [];
	for (const slug of slugs) {
		if (!ctx?.content?.list) {
			results.push({ slug, readable: false, seoEnabled: false, entries: [] });
			continue;
		}
		try {
			const page = await ctx.content.list(slug, { limit: AUDIT_PAGE_SIZE });
			const items: any[] = page?.items ?? [];
			results.push({
				slug,
				readable: true,
				seoEnabled: inferSeoEnabled(items),
				entries: items.map((item) => ({
					id: String(item.id),
					slug: item.slug ?? null,
					status: String(item.status ?? "unknown"),
					noIndex: item.seo?.noIndex,
					title: typeof item.data?.title === "string" ? item.data.title : null,
					data: item.data,
					seo: item.seo,
				})),
			});
		} catch (error) {
			ctx?.log?.warn?.(`[aeo] could not read collection "${slug}"`, error);
			results.push({ slug, readable: false, seoEnabled: false, entries: [] });
		}
	}
	return results;
}

/**
 * Helper to build the Social & OG Manager block response.
 */
async function getSocialPageResponse(settings: AeoSettings, ctx: any, selectedTargetKey?: string) {
	const collections = await auditCollections(settings, ctx);
	const overrides = await loadSocialOverrides(ctx ?? {});
	const socialCols = collections.map((c) => ({
		slug: c.slug,
		readable: c.readable,
		seoEnabled: c.seoEnabled,
		items: c.entries,
	}));
	const { summary, entries } = buildSocialAudit(socialCols, overrides);
	return renderSocialBlocks(summary, entries, selectedTargetKey);
}

/**
 * Execute content-based bulk filler actions across audited collections.
 */
async function executeBulkFill(actionId: string, settings: AeoSettings, ctx: any): Promise<string> {
	const slugs =
		settings.auditCollections && settings.auditCollections.length > 0
			? settings.auditCollections
			: DEFAULT_AUDIT_COLLECTIONS;

	let count = 0;

	for (const slug of slugs) {
		if (!ctx?.content?.list || !ctx?.content?.update) continue;

		try {
			const page = await ctx.content.list(slug, { limit: AUDIT_PAGE_SIZE });
			const items: any[] = page?.items ?? [];
			const seoEnabled = inferSeoEnabled(items);

			for (const item of items) {
				if (actionId === "bulk_fill_descriptions") {
					if (!seoEnabled) continue;
					const existing = item.seo?.description;
					if (!existing || existing.trim() === "") {
						const desc = extractSocialDescription(item.data);
						if (desc) {
							await ctx.content.update(slug, item.id, { seo: { description: desc } });
							count += 1;
						}
					}
				} else if (actionId === "bulk_fill_titles") {
					if (!seoEnabled) continue;
					const existing = item.seo?.title;
					if (!existing || existing.trim() === "") {
						const title = extractSocialTitle(item.data, item.slug);
						if (title) {
							await ctx.content.update(slug, item.id, { seo: { title } });
							count += 1;
						}
					}
				} else if (actionId === "bulk_fill_images") {
					if (!seoEnabled) continue;
					const existing = item.seo?.image;
					if (!existing || existing.trim() === "") {
						const img = extractSocialImage(item.data);
						if (img?.url) {
							await ctx.content.update(slug, item.id, { seo: { image: img.url } });
							count += 1;
						}
					}
				} else if (actionId === "bulk_fill_alts") {
					const pageTitle = typeof item.data?.title === "string" ? item.data.title : item.slug;
					const missing = detectMissingAlt(item.data, pageTitle);
					if (missing.hasMissingAlt && missing.imageField && missing.suggestedAlt) {
						const updatedData = applyAltTextUpdate(item.data, missing.imageField, missing.suggestedAlt);
						await ctx.content.update(slug, item.id, updatedData);
						count += 1;
					}
				}
			}
		} catch (error) {
			ctx?.log?.warn?.(`[aeo] error during bulk action ${actionId} on "${slug}"`, error);
		}
	}

	if (actionId === "bulk_fill_schemas") {
		const collections = await auditCollections(settings, ctx);
		const overrides = await loadSocialOverrides(ctx ?? {});
		for (const col of collections) {
			for (const item of col.entries) {
				const key = `${col.slug}:${item.id}`;
				const existing = overrides[key] ?? {};
				let modified = false;
				const newOverride = { ...existing };
				const title = (typeof item.data?.title === "string" ? item.data.title : "").toLowerCase();
				const slug = (item.slug || "").toLowerCase();

				if (!newOverride.schemaType) {
					if (title.includes("about") || slug.includes("about")) {
						newOverride.schemaType = "AboutPage";
						modified = true;
					} else if (title.includes("contact") || slug.includes("contact")) {
						newOverride.schemaType = "ContactPage";
						modified = true;
					} else if (title.includes("faq") || slug.includes("faq")) {
						newOverride.schemaType = "FAQPage";
						modified = true;
					}
				}

				if (col.slug === "posts" && !newOverride.articleType) {
					newOverride.articleType = "BlogPosting";
					modified = true;
				}

				const isServiceKeywords = ["repair", "installation", "service", "cleaning", "maintenance", "tune-up", "replacement"];
				const isService = col.slug === "pages" && isServiceKeywords.some((w) => title.includes(w) || slug.includes(w));
				if (isService && !newOverride.serviceName) {
					newOverride.serviceName = typeof item.data?.title === "string" ? item.data.title : item.slug || "Service";
					newOverride.serviceType = settings.org?.type || "Service";
					newOverride.serviceDescription = typeof item.data?.excerpt === "string" ? item.data.excerpt : "";
					modified = true;
				}

				if (modified) {
					overrides[key] = newOverride;
					count += 1;
				}
			}
		}
		if (count > 0) {
			await ctx.kv?.set?.(SOCIAL_OVERRIDES_KEY, overrides);
		}
		return count > 0 ? `Auto-applied Schema structured data to ${count} page(s)` : "All pages already have Schema configured";
	}

	if (actionId === "bulk_fill_descriptions") {
		return count > 0 ? `Filled ${count} missing social descriptions` : "All social descriptions are already filled";
	}
	if (actionId === "bulk_fill_titles") {
		return count > 0 ? `Filled ${count} missing social titles` : "All social titles are already filled";
	}
	if (actionId === "bulk_fill_images") {
		return count > 0 ? `Filled ${count} missing social images` : "All social images are already filled";
	}
	if (actionId === "bulk_fill_alts") {
		return count > 0 ? `Filled ${count} missing image alt texts` : "All image alt texts are already filled";
	}
	return `Updated ${count} items`;
}

export default {
	hooks: {
		"page:metadata": {
			handler: async (event: { page: PageLike }, ctx: any): Promise<Contribution[] | null> => {
				const page = event?.page;
				if (!page) return null;

				const settings = await loadSettings(ctx ?? {});
				const faq = await loadFaqPairs(page, settings, ctx);
				const contributions: Contribution[] = [];

				// Check per-page social overrides
				const overrides = await loadSocialOverrides(ctx ?? {});
				const ref = page.content;
				const overrideKey = ref?.collection && ref?.id ? `${ref.collection}:${ref.id}` : null;
				const override = overrideKey ? overrides[overrideKey] : null;

				// The connected entity graph with per-page Schema overrides
				const graph = buildAeoGraph(page, settings, { faq, override });
				if (graph) {
					contributions.push({ kind: "jsonld", id: "primary", graph });
				}

				// Open Graph & Twitter Title override
				if (override?.ogTitle) {
					contributions.push({
						kind: "property",
						property: "og:title",
						content: override.ogTitle,
					});
					contributions.push({
						kind: "meta",
						name: "twitter:title",
						content: override.ogTitle,
					});
				}

				// Open Graph & Twitter Description override
				if (override?.ogDescription) {
					contributions.push({
						kind: "property",
						property: "og:description",
						content: override.ogDescription,
					});
					contributions.push({
						kind: "meta",
						name: "twitter:description",
						content: override.ogDescription,
					});
				}

				// Open Graph & Twitter Image override
				if (override?.ogImage) {
					contributions.push({
						kind: "property",
						property: "og:image",
						content: override.ogImage,
					});
					contributions.push({
						kind: "meta",
						name: "twitter:image",
						content: override.ogImage,
					});
				}

				// Open Graph Type override
				if (override?.ogType) {
					contributions.push({
						kind: "property",
						property: "og:type",
						content: override.ogType,
					});
				}

				// Twitter Card override
				if (override?.twitterCard) {
					contributions.push({
						kind: "meta",
						name: "twitter:card",
						content: override.twitterCard,
					});
				}

				// Twitter attribution. Core emits card/title/description/image but
				// never site or creator, because it has no place to store a handle.
				if (settings.twitterSite) {
					contributions.push({
						kind: "meta",
						name: "twitter:site",
						content: settings.twitterSite,
					});
				}
				const twitterCreator = override?.twitterCreator || settings.twitterCreator;
				if (twitterCreator) {
					contributions.push({
						kind: "meta",
						name: "twitter:creator",
						content: twitterCreator,
					});
				}

				// og:locale is absent from core's base contributions.
				if (page.locale) {
					contributions.push({
						kind: "property",
						property: "og:locale",
						content: page.locale.replace("-", "_"),
					});
				}

				return contributions.length > 0 ? contributions : null;
			},
		},
	},

	routes: {
		// Block Kit admin surface. Returns plain block objects.
		admin: {
			handler: async (routeCtx: any, maybeCtx?: any) => {
				// Native plugins receive (routeCtx) where routeCtx includes { input, content, kv, log }.
				// Sandboxed plugins receive (routeCtx, pluginCtx) where pluginCtx has { content, kv, log }.
				const ctx = maybeCtx || routeCtx || {};
				const interaction = (routeCtx?.input ?? routeCtx ?? {}) as {
					type?: string;
					page?: string;
					action_id?: string;
					value?: unknown;
					values?: Record<string, unknown>;
				};

				// Page: /social
				if (interaction.type === "page_load" && interaction.page === "/social") {
					const settings = await loadSettings(ctx ?? {});
					return getSocialPageResponse(settings, ctx);
				}

				// Bulk actions on /social
				if (
					interaction.type === "block_action" &&
					interaction.action_id &&
					[
						"bulk_fill_descriptions",
						"bulk_fill_titles",
						"bulk_fill_images",
						"bulk_fill_alts",
						"bulk_fill_schemas",
					].includes(interaction.action_id)
				) {
					const settings = await loadSettings(ctx ?? {});
					const message = await executeBulkFill(interaction.action_id, settings, ctx);
					const response = await getSocialPageResponse(settings, ctx);
					return {
						...response,
						toast: { message, type: "success" },
					};
				}

				// Table interaction on /social
				if (interaction.type === "block_action" && interaction.action_id === "social_table_page") {
					const settings = await loadSettings(ctx ?? {});
					return getSocialPageResponse(settings, ctx);
				}

				// Page selection change on /social
				if (interaction.type === "block_action" && interaction.action_id === "select_page_to_edit") {
					let selectedKey: string | undefined;
					const rawVal = (interaction as any).value;
					if (typeof rawVal === "string") {
						selectedKey = rawVal;
					} else if (rawVal && typeof rawVal === "object" && "value" in rawVal) {
						selectedKey = String(rawVal.value);
					}
					const settings = await loadSettings(ctx ?? {});
					return getSocialPageResponse(settings, ctx, selectedKey);
				}

				// Page: /social save single page
				if (interaction.type === "form_submit" && interaction.action_id === "save_social_item") {
					const values = interaction.values ?? {};
					const targetPage = typeof values.target_page === "string" ? values.target_page : "";
					const [targetCol, targetId] = targetPage.split(":");

					if (targetCol && targetId) {
						const ogTitle = typeof values.og_title === "string" ? values.og_title.trim() : "";
						const ogDesc = typeof values.og_description === "string" ? values.og_description.trim() : "";
						const ogImage = typeof values.og_image === "string" ? values.og_image.trim() : "";
						const ogType = typeof values.og_type === "string" ? values.og_type.trim() : "";
						const twitterCard = typeof values.twitter_card === "string" ? values.twitter_card.trim() : "";
						const twitterCreator = typeof values.twitter_creator === "string" ? values.twitter_creator.trim() : "";

						// Schema.org fields
						const schemaType = typeof values.schema_type === "string" ? values.schema_type.trim() : "";
						const rawArticleType = typeof values.article_type === "string" ? values.article_type.trim() : "";
						const articleType = rawArticleType === "none" ? undefined : rawArticleType || undefined;
						const serviceName = typeof values.service_name === "string" ? values.service_name.trim() : "";
						const serviceType = typeof values.service_type === "string" ? values.service_type.trim() : "";
						const serviceArea = typeof values.service_area === "string" ? values.service_area.trim() : "";
						const serviceDesc = typeof values.service_desc === "string" ? values.service_desc.trim() : "";
						const customSchemaJson = typeof values.custom_schema_json === "string" ? values.custom_schema_json.trim() : "";

						// 1. Update core SEO if possible
						try {
							const item = await ctx?.content?.get?.(targetCol, targetId);
							if (item && item.seo !== undefined && ctx?.content?.update) {
								await ctx.content.update(targetCol, targetId, {
									seo: {
										title: ogTitle || undefined,
										description: ogDesc || undefined,
										image: ogImage || undefined,
									},
								});
							}
						} catch (error) {
							ctx?.log?.warn?.(`[aeo] could not update core seo for ${targetPage}`, error);
						}

						// 2. Save overrides in plugin KV
						const overrides = await loadSocialOverrides(ctx ?? {});
						overrides[targetPage] = {
							...overrides[targetPage],
							ogTitle: ogTitle || undefined,
							ogDescription: ogDesc || undefined,
							ogImage: ogImage || undefined,
							ogType: ogType || undefined,
							twitterCard: twitterCard || undefined,
							twitterCreator: twitterCreator || undefined,
							schemaType: schemaType || undefined,
							articleType,
							serviceName: serviceName || undefined,
							serviceType: serviceType || undefined,
							serviceAreaServed: serviceArea || undefined,
							serviceDescription: serviceDesc || undefined,
							customSchemaJson: customSchemaJson || undefined,
						};
						try {
							await ctx.kv?.set?.(SOCIAL_OVERRIDES_KEY, overrides);
						} catch (error) {
							ctx?.log?.error?.(`[aeo] could not save social/schema override for ${targetPage}`, error);
						}
					}

					const settings = await loadSettings(ctx ?? {});
					const response = await getSocialPageResponse(settings, ctx, targetPage);
					return {
						...response,
						toast: { message: "Social & Schema metadata saved", type: "success" },
					};
				}

				// Page: /indexing
				if (interaction.type === "page_load" && interaction.page === "/indexing") {
					const settings = await loadSettings(ctx ?? {});
					const collections = await auditCollections(settings, ctx);
					return renderIndexingBlocks(buildIndexingReport(collections));
				}

				// Page: /settings
				if (interaction.type === "page_load" && interaction.page === "/settings") {
					return buildSettingsBlocks(await loadSettings(ctx ?? {}));
				}

				// Page: /settings save
				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					const { settings, warnings } = formValuesToSettings(interaction.values ?? {});
					try {
						await ctx.kv.set(SETTINGS_KEY, settings);
					} catch (error) {
						ctx?.log?.error?.("[aeo] could not save settings", error);
						return {
							...buildSettingsBlocks(settings),
							toast: { message: "Could not save settings", type: "error" },
						};
					}

					// Warnings are surfaced rather than swallowed: a skipped service
					// row means schema the merchant expects is NOT being published.
					return {
						...buildSettingsBlocks(settings),
						toast: {
							message: warnings.length > 0 ? warnings.join(" ") : "Settings saved",
							type: warnings.length > 0 ? "warning" : "success",
						},
					};
				}

				return { blocks: [] };
			},
		},
	},
};
