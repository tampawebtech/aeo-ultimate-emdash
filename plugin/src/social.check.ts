/**
 * Unit check for content extraction, social audit, and Open Graph / Twitter manager.
 * Run with: `node src/social.check.ts`
 */

import assert from "node:assert";
import {
	extractPlainTextFromPortableText,
	truncateSocialDescription,
	extractSocialDescription,
	extractSocialTitle,
	extractSocialImage,
	detectMissingAlt,
	applyAltTextUpdate,
	generateContentAltText,
} from "./contentExtractor.ts";
import {
	buildSocialAudit,
	renderSocialBlocks,
	type RawAuditCollection,
	type SocialPageOverride,
} from "./socialManager.ts";
import plugin from "./plugin.ts";

console.log("=== 1. Testing contentExtractor ===");

// 1. Portable Text Plain Text Extraction
const mockPt = [
	{
		_type: "block",
		children: [
			{ _type: "span", text: "When a system stops cooling, " },
			{ _type: "span", text: "the cause is usually a capacitor." },
		],
	},
	{
		_type: "block",
		children: [{ _type: "span", text: "Call an expert before replacing the unit." }],
	},
];
const ptText = extractPlainTextFromPortableText(mockPt);
assert.strictEqual(
	ptText,
	"When a system stops cooling, the cause is usually a capacitor. Call an expert before replacing the unit.",
);
console.log("✓ Portable Text extraction passes");

// 2. Truncation
const longString = "A".repeat(200);
const truncated = truncateSocialDescription(longString, 155);
assert.ok(truncated.length <= 155);
assert.ok(truncated.endsWith("..."));

const sentence = "The frameworks will change. The databases will change. What survives is the clarity of your thinking and how well you structure your data.";
const truncatedSentence = truncateSocialDescription(sentence, 60);
assert.ok(truncatedSentence.length <= 60);
assert.ok(truncatedSentence.endsWith("..."));
console.log("✓ Truncation passes:", truncatedSentence);

// 3. Social Description Extraction
const itemWithExcerpt = {
	title: "Post 1",
	excerpt: "An explicit excerpt for social sharing.",
	content: mockPt,
};
assert.strictEqual(
	extractSocialDescription(itemWithExcerpt),
	"An explicit excerpt for social sharing.",
);

const itemWithoutExcerpt = {
	title: "Post 2",
	content: mockPt,
};
assert.strictEqual(
	extractSocialDescription(itemWithoutExcerpt),
	"When a system stops cooling, the cause is usually a capacitor. Call an expert before replacing the unit.",
);
console.log("✓ Social description extraction passes");

// 4. Social Title Extraction
assert.strictEqual(extractSocialTitle({ title: "My Clean Title" }), "My Clean Title");
assert.strictEqual(extractSocialTitle({}, "my-great-post"), "My Great Post");
console.log("✓ Social title extraction passes");

// 5. Social Image & Alt Extraction
const itemWithMedia = {
	featured_image: {
		$media: {
			url: "https://example.com/photo.jpg",
			alt: "A scenic mountain",
			filename: "mountain-view.jpg",
		},
	},
};
const extractedMedia = extractSocialImage(itemWithMedia);
assert.strictEqual(extractedMedia?.url, "https://example.com/photo.jpg");
assert.strictEqual(extractedMedia?.alt, "A scenic mountain");

const itemWithMissingAlt = {
	title: "HVAC Maintenance",
	featured_image: {
		$media: {
			url: "https://example.com/unit.jpg",
			alt: "",
			filename: "ac-unit.jpg",
		},
	},
};
const missingCheck = detectMissingAlt(itemWithMissingAlt, "HVAC Maintenance");
assert.strictEqual(missingCheck.hasMissingAlt, true);
assert.strictEqual(missingCheck.suggestedAlt, "Illustration for HVAC Maintenance");

// 6. Applying Alt Text Update
const updatedData = applyAltTextUpdate(
	itemWithMissingAlt,
	"featured_image",
	"Updated descriptive alt text",
);
const updatedImg = extractSocialImage(updatedData);
assert.strictEqual(updatedImg?.alt, "Updated descriptive alt text");
console.log("✓ Image and alt text handling passes");

console.log("\n=== 2. Testing socialManager ===");

const mockCollections: RawAuditCollection[] = [
	{
		slug: "posts",
		readable: true,
		seoEnabled: true,
		items: [
			{
				id: "post-1",
				slug: "building-for-the-long-term",
				status: "published",
				data: itemWithExcerpt,
				seo: {
					title: "Building for the Long Term",
					description: null, // missing description
					image: "https://example.com/building.jpg",
				},
			},
			{
				id: "post-2",
				slug: "weekend-project",
				status: "published",
				data: itemWithoutExcerpt,
				seo: {
					title: "Weekend Project",
					description: "Pre-existing description",
					image: null, // missing image
				},
			},
		],
	},
	{
		slug: "pages",
		readable: true,
		seoEnabled: false,
		items: [
			{
				id: "about",
				slug: "about",
				status: "published",
				data: { title: "About Us", content: "We are a local business." },
			},
		],
	},
];

const overrides: Record<string, SocialPageOverride> = {
	"posts:post-1": {
		twitterCreator: "@custom_author",
	},
};

const audit = buildSocialAudit(mockCollections, overrides);
assert.strictEqual(audit.summary.totalPages, 3);
assert.strictEqual(audit.entries.length, 3);

// Post-1 had missing SEO description, but suggestedDescription was derived
const post1 = audit.entries.find((e) => e.id === "post-1");
assert.ok(post1);
assert.strictEqual(post1?.twitterCreator, "@custom_author");
assert.strictEqual(post1?.hasMissingDescription, true);
assert.strictEqual(post1?.suggestedDescription, "An explicit excerpt for social sharing.");

// Render Block Kit UI
const blocksResponse = renderSocialBlocks(audit.summary, audit.entries);
assert.ok(blocksResponse.blocks.length >= 6);

// Verify required blocks exist
const statsBlock = blocksResponse.blocks.find((b) => b.type === "stats");
assert.ok(statsBlock, "Stats block should be present");

const actionsBlock = blocksResponse.blocks.find((b) => b.type === "actions");
assert.ok(actionsBlock, "Actions block should be present");

const tableBlock = blocksResponse.blocks.find((b) => b.type === "table");
assert.ok(tableBlock, "Table block should be present");

const formBlock = blocksResponse.blocks.find((b) => b.type === "form");
assert.ok(formBlock, "Editor form block should be present");

console.log("✓ Social audit and Block Kit rendering passes");

console.log("\n=== 3. Testing plugin page:metadata hook with overrides ===");

const mockPage = {
	url: "https://example.com/posts/building-for-the-long-term",
	path: "/posts/building-for-the-long-term",
	locale: "en-US",
	kind: "content" as const,
	pageType: "article",
	title: "Building for the Long Term",
	description: null,
	canonical: "https://example.com/posts/building-for-the-long-term",
	image: null,
	content: { collection: "posts", id: "post-1", slug: "building-for-the-long-term" },
};

const mockCtx = {
	kv: {
		get: async (key: string) => {
			if (key === "social_overrides") {
				return {
					"posts:post-1": {
						ogTitle: "Custom OG Headline",
						ogDescription: "Custom share description",
						ogImage: "https://example.com/custom-og.jpg",
						ogType: "article",
						twitterCard: "summary_large_image",
						twitterCreator: "@custom_author",
					},
				};
			}
			if (key === "settings") {
				return {
					twitterSite: "@business",
				};
			}
			return null;
		},
	},
};

const metadataHandler = plugin.hooks["page:metadata"].handler;
const contributions = await metadataHandler({ page: mockPage }, mockCtx);
assert.ok(contributions && contributions.length > 0);

const ogTitleContrib = contributions.find(
	(c) => c.kind === "property" && (c as any).property === "og:title",
);
assert.strictEqual((ogTitleContrib as any)?.content, "Custom OG Headline");

const ogDescContrib = contributions.find(
	(c) => c.kind === "property" && (c as any).property === "og:description",
);
assert.strictEqual((ogDescContrib as any)?.content, "Custom share description");

const twitterCardContrib = contributions.find(
	(c) => c.kind === "meta" && (c as any).name === "twitter:card",
);
assert.strictEqual((twitterCardContrib as any)?.content, "summary_large_image");

const twitterCreatorContrib = contributions.find(
	(c) => c.kind === "meta" && (c as any).name === "twitter:creator",
);
assert.strictEqual((twitterCreatorContrib as any)?.content, "@custom_author");

const twitterSiteContrib = contributions.find(
	(c) => c.kind === "meta" && (c as any).name === "twitter:site",
);
assert.strictEqual((twitterSiteContrib as any)?.content, "@business");

console.log("✓ page:metadata hook correctly outputs overrides for Open Graph and Twitter");

console.log("\n=== 4. Testing switching page to edit ===");
// Test rendering with selectedTargetKey = "pages:about"
const blocksForAbout = renderSocialBlocks(audit.summary, audit.entries, "pages:about");
const aboutForm = blocksForAbout.blocks.find((b) => b.type === "form");
assert.ok(aboutForm);
assert.strictEqual((aboutForm as any).block_id, "edit_social_page_pages_about");
const aboutTitleField = (aboutForm as any).fields.find((f: any) => f.action_id === "og_title");
assert.strictEqual(aboutTitleField.placeholder, "About Us");

// Test admin handler with block_action select_page_to_edit
const selectPageResponse = await (plugin as any).routes.admin.handler(
	{ input: { type: "block_action", action_id: "select_page_to_edit", value: "pages:about" } },
	{
		kv: mockCtx.kv,
		content: {
			list: async (col: string) => {
				const found = mockCollections.find((c) => c.slug === col);
				return { items: found?.items ?? [] };
			},
		},
	},
);
assert.ok(selectPageResponse.blocks);
const switchForm = selectPageResponse.blocks.find((b: any) => b.type === "form");
assert.ok(switchForm);
assert.strictEqual(switchForm.block_id, "edit_social_page_pages_about");
console.log("✓ Page switching correctly changes target form and pre-filled fields");

console.log("\n=== 5. Testing Schema editing and graph generation ===");
// Verify Schema fields are rendered in form
const schemaTypeField = (aboutForm as any).fields.find((f: any) => f.action_id === "schema_type");
assert.ok(schemaTypeField, "schema_type field must be present");
assert.strictEqual(schemaTypeField.initial_value, "AboutPage");

const serviceNameField = (aboutForm as any).fields.find((f: any) => f.action_id === "service_name");
assert.ok(serviceNameField, "service_name field must be present");

// Test buildAeoGraph with Schema overrides
import { buildAeoGraph } from "./graph.ts";

const serviceOverride = {
	schemaType: "ItemPage",
	serviceName: "24/7 AC Emergency Repair",
	serviceType: "HVAC",
	serviceDescription: "Fast emergency air conditioning repair in Hillsborough County.",
	serviceAreaServed: "Tampa Bay",
	customSchemaJson: '{"@type": "SpecialAnnouncement", "name": "Summer Discount"}',
};

const pageWithService = {
	url: "https://example.com/services/ac-repair",
	path: "/services/ac-repair",
	locale: "en-US",
	kind: "content" as const,
	pageType: "page",
	title: "AC Repair Services",
	description: "Professional HVAC repair services.",
	canonical: "https://example.com/services/ac-repair",
	image: null,
};

const serviceGraph = buildAeoGraph(pageWithService, { org: { name: "Gulf Coast HVAC" } }, { override: serviceOverride });
assert.ok(serviceGraph && Array.isArray((serviceGraph as any)["@graph"]));
const nodes = (serviceGraph as any)["@graph"];

// Check WebPage node has schemaType ItemPage
const webPage = nodes.find((n: any) => n["@id"] === "https://example.com/services/ac-repair#webpage");
assert.ok(webPage);
assert.strictEqual(webPage["@type"], "ItemPage");

// Check Service node exists and has override details
const serviceNode = nodes.find((n: any) => n["@type"] === "Service");
assert.ok(serviceNode, "Service node should be emitted when serviceName override is present");
assert.strictEqual(serviceNode.name, "24/7 AC Emergency Repair");
assert.strictEqual(serviceNode.serviceType, "HVAC");
assert.strictEqual(serviceNode.areaServed, "Tampa Bay");

// Check Custom Schema JSON-LD announcement is present
const customNode = nodes.find((n: any) => n["@type"] === "SpecialAnnouncement");
assert.ok(customNode, "Custom Schema JSON-LD node should be included in graph");
assert.strictEqual(customNode.name, "Summer Discount");

console.log("✓ Schema.org graph generation correctly incorporates per-page overrides");

console.log("\nALL SOCIAL & SCHEMA TESTS PASSED SUCCESSFULLY! ✨");
