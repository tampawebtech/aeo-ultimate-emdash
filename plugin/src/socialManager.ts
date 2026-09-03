/**
 * Unified Open Graph and Twitter/X Card Manager - audit logic and Block Kit rendering.
 *
 * Provides a single screen to:
 * 1. Scan every page for social metadata coverage (og:title, og:description, og:image, og:type, twitter:card, twitter:creator).
 * 2. Execute content-based bulk actions to fill missing metadata (100% local, free).
 * 3. Edit per-page social metadata and save overrides.
 */

import {
	extractSocialDescription,
	extractSocialTitle,
	extractSocialImage,
	detectMissingAlt,
} from "./contentExtractor.ts";

export interface SocialPageOverride {
	ogTitle?: string;
	ogDescription?: string;
	ogImage?: string;
	ogType?: string;
	twitterCard?: string;
	twitterCreator?: string;

	// Schema.org per-page overrides
	schemaType?: string;
	articleType?: string;
	serviceName?: string;
	serviceType?: string;
	serviceDescription?: string;
	serviceAreaServed?: string;
	customSchemaJson?: string;
}

export interface SocialPageEntry {
	collection: string;
	id: string;
	slug: string | null;
	title: string;
	status: string;
	// Resolved social properties
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	ogType: string;
	twitterCard: string;
	twitterCreator: string;
	// Resolved Schema.org properties
	schemaType: string;
	articleType: string;
	serviceName: string;
	serviceType: string;
	serviceDescription: string;
	serviceAreaServed: string;
	customSchemaJson: string;
	// Audit flags
	hasMissingDescription: boolean;
	hasMissingImage: boolean;
	hasMissingAlt: boolean;
	hasMissingSchema: boolean;
	suggestedDescription: string | null;
	suggestedTitle: string | null;
	suggestedImage: string | null;
	suggestedAlt: string | null;
	suggestedSchemaType: string | null;
	imageField: string | null;
}

export interface SocialAuditSummary {
	totalPages: number;
	completePages: number;
	missingDescriptions: number;
	missingImages: number;
	missingAltTexts: number;
	missingTitles: number;
	missingSchemas: number;
}

export interface RawCollectionItem {
	id: string;
	slug?: string | null;
	status?: string;
	data?: Record<string, unknown>;
	seo?: {
		title?: string | null;
		description?: string | null;
		image?: string | null;
		canonical?: string | null;
		noIndex?: boolean;
	};
}

export interface RawAuditCollection {
	slug: string;
	readable: boolean;
	seoEnabled: boolean;
	items: RawCollectionItem[];
}

/**
 * Scan collections and merge with any saved social overrides to create the unified audit.
 */
export function buildSocialAudit(
	collections: RawAuditCollection[],
	overrides: Record<string, SocialPageOverride> = {},
): { summary: SocialAuditSummary; entries: SocialPageEntry[] } {
	const entries: SocialPageEntry[] = [];
	let missingDescriptions = 0;
	let missingImages = 0;
	let missingAltTexts = 0;
	let missingTitles = 0;
	let missingSchemas = 0;
	let completePages = 0;

	for (const col of collections) {
		if (!col.readable) continue;

		for (const item of col.items) {
			const key = `${col.slug}:${item.id}`;
			const override = overrides[key] ?? {};

			const contentTitle = typeof item.data?.title === "string" ? item.data.title : null;
			const pageTitle = contentTitle || item.slug || item.id;

			// Check existing SEO or overrides
			const existingSeoTitle = item.seo?.title || null;
			const existingSeoDesc = item.seo?.description || null;
			const existingSeoImage = item.seo?.image || null;

			// Suggestions derived from content
			const suggestedTitle = extractSocialTitle(item.data, item.slug);
			const suggestedDesc = extractSocialDescription(item.data);
			const extractedImg = extractSocialImage(item.data);
			const altStatus = detectMissingAlt(item.data, pageTitle);

			const resolvedTitle = override.ogTitle || existingSeoTitle || suggestedTitle || pageTitle;
			const resolvedDesc = override.ogDescription || existingSeoDesc || "";
			const resolvedImg = override.ogImage || existingSeoImage || extractedImg?.url || "";
			const resolvedType = override.ogType || (col.slug === "posts" ? "article" : "website");
			const resolvedCard = override.twitterCard || (resolvedImg ? "summary_large_image" : "summary");
			const resolvedCreator = override.twitterCreator || "";

			// Schema.org resolution
			const lowerTitle = pageTitle.toLowerCase();
			const lowerSlug = (item.slug || "").toLowerCase();
			let suggestedSchema = "WebPage";
			if (lowerTitle.includes("about") || lowerSlug.includes("about")) {
				suggestedSchema = "AboutPage";
			} else if (lowerTitle.includes("contact") || lowerSlug.includes("contact")) {
				suggestedSchema = "ContactPage";
			} else if (lowerTitle.includes("faq") || lowerSlug.includes("faq")) {
				suggestedSchema = "FAQPage";
			} else if (col.slug === "posts") {
				suggestedSchema = "Article";
			}

			const isServiceKeywords = ["repair", "installation", "service", "cleaning", "maintenance", "tune-up", "replacement"];
			const isPotentialService = col.slug === "pages" && isServiceKeywords.some((w) => lowerTitle.includes(w) || lowerSlug.includes(w));

			const resolvedSchemaType = override.schemaType || (suggestedSchema !== "WebPage" ? suggestedSchema : "WebPage");
			const resolvedArticleType = override.articleType || (col.slug === "posts" ? "BlogPosting" : "none");
			const resolvedServiceName = override.serviceName || (isPotentialService ? pageTitle : "");
			const resolvedServiceType = override.serviceType || "";
			const resolvedServiceDesc = override.serviceDescription || "";
			const resolvedServiceArea = override.serviceAreaServed || "";
			const resolvedCustomSchema = override.customSchemaJson || "";

			const hasMissingDesc = !resolvedDesc || resolvedDesc.trim() === "";
			const hasMissingImg = !resolvedImg || resolvedImg.trim() === "";
			const hasMissingAlt = altStatus.hasMissingAlt;
			const hasMissingTitle = !existingSeoTitle && !override.ogTitle;
			const hasMissingSchema = isPotentialService && !override.serviceName;

			if (hasMissingDesc) missingDescriptions += 1;
			if (hasMissingImg) missingImages += 1;
			if (hasMissingAlt) missingAltTexts += 1;
			if (hasMissingTitle) missingTitles += 1;
			if (hasMissingSchema) missingSchemas += 1;

			if (!hasMissingDesc && !hasMissingImg && !hasMissingAlt && !hasMissingSchema) {
				completePages += 1;
			}

			entries.push({
				collection: col.slug,
				id: String(item.id),
				slug: item.slug || null,
				title: pageTitle,
				status: String(item.status || "published"),
				ogTitle: resolvedTitle,
				ogDescription: resolvedDesc,
				ogImage: resolvedImg,
				ogType: resolvedType,
				twitterCard: resolvedCard,
				twitterCreator: resolvedCreator,
				schemaType: resolvedSchemaType,
				articleType: resolvedArticleType,
				serviceName: resolvedServiceName,
				serviceType: resolvedServiceType,
				serviceDescription: resolvedServiceDesc,
				serviceAreaServed: resolvedServiceArea,
				customSchemaJson: resolvedCustomSchema,
				hasMissingDescription: hasMissingDesc,
				hasMissingImage: hasMissingImg,
				hasMissingAlt,
				hasMissingSchema,
				suggestedDescription: suggestedDesc,
				suggestedTitle,
				suggestedImage: extractedImg?.url || null,
				suggestedAlt: altStatus.suggestedAlt || null,
				suggestedSchemaType: suggestedSchema,
				imageField: altStatus.imageField || null,
			});
		}
	}

	const summary: SocialAuditSummary = {
		totalPages: entries.length,
		completePages,
		missingDescriptions,
		missingImages,
		missingAltTexts,
		missingTitles,
		missingSchemas,
	};

	return { summary, entries };
}

type Block = Record<string, unknown>;

/**
 * Render the Block Kit UI for the Unified Social & Schema.org Manager.
 */
export function renderSocialBlocks(
	summary: SocialAuditSummary,
	entries: SocialPageEntry[],
	selectedTargetKey?: string,
): { blocks: Block[] } {
	const blocks: Block[] = [
		{ type: "header", text: "Social & Schema.org Manager" },
		{
			type: "banner",
			variant: "default",
			title: "Coverage Overview & Bulk Actions",
			description:
				"Audit and edit Open Graph titles, descriptions, share images, Twitter Cards, and Schema.org structured data (WebPage, AboutPage, ContactPage, Service, Article) across every page from one screen. All bulk actions are 100% free and local.",
		},
		{
			type: "stats",
			items: [
				{
					label: "Total Pages",
					value: String(summary.totalPages),
				},
				{
					label: "Missing Descriptions",
					value: String(summary.missingDescriptions),
					description: summary.missingDescriptions === 0 ? "All filled" : "Need social description",
				},
				{
					label: "Missing Share Images",
					value: String(summary.missingImages),
					description: summary.missingImages === 0 ? "All set" : "No OG image found",
				},
				{
					label: "Missing Alt Texts",
					value: String(summary.missingAltTexts),
					description: summary.missingAltTexts === 0 ? "Accessible" : "Missing image alt text",
				},
				{
					label: "Missing Service Schema",
					value: String(summary.missingSchemas),
					description: summary.missingSchemas === 0 ? "All labeled" : "Service pages need schema",
				},
			],
		},
		{ type: "divider" },
		{ type: "header", text: "Bulk Actions (Free & Content-Based)" },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					label: "Fill Missing Descriptions",
					action_id: "bulk_fill_descriptions",
					style: "primary",
					confirm: {
						title: "Fill Missing Descriptions?",
						text: "Automatically extracts summaries from page excerpts and content for all pages missing descriptions. Runs locally and is 100% free.",
						confirm: "Fill All Missing",
						deny: "Cancel",
					},
				},
				{
					type: "button",
					label: "Fill Missing OG Titles",
					action_id: "bulk_fill_titles",
					confirm: {
						title: "Fill Missing OG Titles?",
						text: "Populates SEO titles using page headings and slugs for pages without custom titles. Runs locally and is 100% free.",
						confirm: "Fill Titles",
						deny: "Cancel",
					},
				},
				{
					type: "button",
					label: "Fill Missing OG Images",
					action_id: "bulk_fill_images",
					confirm: {
						title: "Fill Missing OG Images?",
						text: "Detects featured and embedded content images and maps them to Open Graph image fields. Runs locally and is 100% free.",
						confirm: "Fill Images",
						deny: "Cancel",
					},
				},
				{
					type: "button",
					label: "Fill Missing Alt Text",
					action_id: "bulk_fill_alts",
					confirm: {
						title: "Fill Missing Image Alt Texts?",
						text: "Generates descriptive alt text from article context and filenames for images currently lacking alt text. Runs locally and is 100% free.",
						confirm: "Fill Alt Texts",
						deny: "Cancel",
					},
				},
				{
					type: "button",
					label: "Auto-Fill Schemas",
					action_id: "bulk_fill_schemas",
					confirm: {
						title: "Auto-Detect & Fill Missing Schemas?",
						text: "Automatically assigns AboutPage, ContactPage, Service, and BlogPosting schemas to pages based on their titles and contents. Runs locally and is 100% free.",
						confirm: "Fill Schemas",
						deny: "Cancel",
					},
				},
			],
		},
		{ type: "divider" },
		{ type: "header", text: "Page Social & Schema Coverage" },
		{
			type: "table",
			columns: [
				{ key: "page", label: "Page" },
				{ key: "collection", label: "Collection" },
				{ key: "schema_type", label: "Schema Type" },
				{ key: "og_title", label: "OG Title" },
				{ key: "og_desc", label: "OG Description" },
				{ key: "og_image", label: "OG Image" },
				{ key: "status", label: "Coverage" },
			],
			rows: entries.map((e) => {
				const descDisplay = e.ogDescription
					? e.ogDescription.length > 30
						? e.ogDescription.slice(0, 27) + "..."
						: e.ogDescription
					: "⚠️ Missing";

				const imgDisplay = e.ogImage
					? e.ogImage.length > 25
						? "..." + e.ogImage.slice(-20)
						: e.ogImage
					: "⚠️ Missing";

				const schemaDisplay = e.serviceName ? `Service (${e.schemaType})` : e.schemaType;

				const statusIssues: string[] = [];
				if (e.hasMissingDescription) statusIssues.push("no desc");
				if (e.hasMissingImage) statusIssues.push("no img");
				if (e.hasMissingAlt) statusIssues.push("no alt");
				if (e.hasMissingSchema) statusIssues.push("no service schema");

				const status = statusIssues.length === 0 ? "✅ Complete" : `⚠️ Needs ${statusIssues.join(", ")}`;

				return {
					page: e.title,
					collection: e.collection,
					schema_type: schemaDisplay,
					og_title: e.ogTitle || "—",
					og_desc: descDisplay,
					og_image: imgDisplay,
					status,
				};
			}),
			page_action_id: "social_table_page",
			empty_text: "No pages found in audited collections.",
		},
		{ type: "divider" },
		{ type: "header", text: "Edit Social & Schema Metadata for a Page" },
		{
			type: "context",
			text: "Select any page to customize its Open Graph title, description, share image, Twitter Card, and Schema.org structured data (Page Type, Article Type, Service details, or Custom JSON-LD). Changes apply directly to the page.",
		},
	];

	// Target page selection options
	const targetOptions = entries.map((e) => ({
		label: `${e.title} (${e.collection})`,
		value: `${e.collection}:${e.id}`,
	}));

	const defaultKey = selectedTargetKey || (targetOptions.length > 0 ? targetOptions[0].value : "");
	const activeEntry = entries.find((e) => `${e.collection}:${e.id}` === defaultKey) || entries[0];

	if (targetOptions.length > 0 && activeEntry) {
		// 1. Interactive page selector in an actions block - triggers block_action immediately on change
		blocks.push({
			type: "actions",
			block_id: `page_selector_actions_${activeEntry.collection}_${activeEntry.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
			elements: [
				{
					type: "select",
					action_id: "select_page_to_edit",
					label: "Select Page to Edit",
					options: targetOptions,
					initial_value: `${activeEntry.collection}:${activeEntry.id}`,
				},
			],
		});

		// 2. Clear visual indicator of active page
		blocks.push({
			type: "context",
			text: `Currently editing: **${activeEntry.title}** (Collection: *${activeEntry.collection}*, Schema: *${activeEntry.serviceName ? `Service (${activeEntry.schemaType})` : activeEntry.schemaType}*)`,
		});

		// 3. Form with unique block_id per entry so React resets input state on page change
		const formBlockId = `edit_social_page_${activeEntry.collection}_${activeEntry.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

		blocks.push({
			type: "form",
			block_id: formBlockId,
			fields: [
				{
					type: "select",
					action_id: "target_page",
					label: "Target Page",
					options: targetOptions,
					initial_value: `${activeEntry.collection}:${activeEntry.id}`,
				},
				// Social & Open Graph Fields
				{
					type: "text_input",
					action_id: "og_title",
					label: "Open Graph / Social Title",
					placeholder: activeEntry.suggestedTitle || "Page title",
					initial_value: activeEntry.ogTitle || "",
				},
				{
					type: "text_input",
					action_id: "og_description",
					label: "Open Graph / Social Description",
					multiline: true,
					placeholder: activeEntry.suggestedDescription || "Enter 150-160 character description",
					initial_value: activeEntry.ogDescription || "",
				},
				{
					type: "text_input",
					action_id: "og_image",
					label: "Social Share Image URL",
					placeholder: activeEntry.suggestedImage || "https://example.com/share.jpg",
					initial_value: activeEntry.ogImage || "",
				},
				{
					type: "select",
					action_id: "og_type",
					label: "Open Graph Type",
					options: [
						{ label: "Article (posts, news)", value: "article" },
						{ label: "Website (standard page)", value: "website" },
					],
					initial_value: activeEntry.ogType || "website",
				},
				{
					type: "select",
					action_id: "twitter_card",
					label: "Twitter / X Card Type",
					options: [
						{ label: "Summary with Large Image (recommended)", value: "summary_large_image" },
						{ label: "Summary (compact)", value: "summary" },
					],
					initial_value: activeEntry.twitterCard || "summary_large_image",
				},
				{
					type: "text_input",
					action_id: "twitter_creator",
					label: "Twitter / X Creator Handle",
					placeholder: "@author",
					initial_value: activeEntry.twitterCreator || "",
				},

				// Schema.org Structured Data Fields
				{
					type: "select",
					action_id: "schema_type",
					label: "Schema.org Page Type",
					options: [
						{ label: "WebPage (Default standard page)", value: "WebPage" },
						{ label: "AboutPage (About Us, Company bio)", value: "AboutPage" },
						{ label: "ContactPage (Contact Us, locations)", value: "ContactPage" },
						{ label: "FAQPage (Frequently asked questions)", value: "FAQPage" },
						{ label: "ItemPage (Specific product / service / item)", value: "ItemPage" },
						{ label: "CollectionPage (Directory, list, archive)", value: "CollectionPage" },
					],
					initial_value: activeEntry.schemaType || "WebPage",
				},
				{
					type: "select",
					action_id: "article_type",
					label: "Schema.org Article Type",
					options: [
						{ label: "None (Not an article)", value: "none" },
						{ label: "BlogPosting (Standard blog post)", value: "BlogPosting" },
						{ label: "Article (General article)", value: "Article" },
						{ label: "NewsArticle (News or press release)", value: "NewsArticle" },
						{ label: "TechArticle (Technical guide / how-to)", value: "TechArticle" },
					],
					initial_value: activeEntry.articleType || (activeEntry.collection === "posts" ? "BlogPosting" : "none"),
				},
				{
					type: "text_input",
					action_id: "service_name",
					label: "Service Schema Name (leave blank if not a service)",
					placeholder: "e.g. AC Repair & Maintenance",
					initial_value: activeEntry.serviceName || "",
				},
				{
					type: "text_input",
					action_id: "service_type",
					label: "Service Category / Type",
					placeholder: "e.g. HVAC, Plumbing, Legal, Roofing",
					initial_value: activeEntry.serviceType || "",
				},
				{
					type: "text_input",
					action_id: "service_area",
					label: "Service Area Served",
					placeholder: "e.g. Tampa Bay, Hillsborough & Pinellas County",
					initial_value: activeEntry.serviceAreaServed || "",
				},
				{
					type: "text_input",
					action_id: "service_desc",
					label: "Service Description",
					multiline: true,
					placeholder: "Detailed description of the service offered on this page...",
					initial_value: activeEntry.serviceDescription || "",
				},
				{
					type: "text_input",
					action_id: "custom_schema_json",
					label: "Custom Schema.org JSON-LD (Optional)",
					multiline: true,
					placeholder: '{"@type": "SpecialAnnouncement", "name": "Holiday Special"}',
					initial_value: activeEntry.customSchemaJson || "",
				},
			],
			submit: { label: "Save Social & Schema Metadata", action_id: "save_social_item" },
		},
		{
			type: "context",
			text: "Saving updates the page's core SEO configuration, Open Graph tags, and connected Schema.org structured data graph.",
		});
	}

	return { blocks };
}
