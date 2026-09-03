/**
 * Pure Schema.org graph builders.
 *
 * No EmDash imports, no I/O, so this file is unit-testable in plain Node
 * and safe to run inside a sandboxed isolate.
 *
 * Design note: EmDash core already emits a *disconnected* BlogPosting or
 * WebSite under the dedupe id "primary" (emdash/src/page/seo-contributions.ts).
 * Plugin contributions are composed BEFORE core's, and resolvePageMetadata()
 * is first-wins, so contributing id "primary" replaces that baseline outright
 * rather than duplicating it. That is the whole integration point: we trade
 * two disconnected islands for one @id-linked @graph.
 */

import type { FaqPair } from "./extract.ts";

// Types mirroring PublicPageContext, kept local so this file has no deps.

export interface AuthorCredential {
	author?: string;
	name: string;
	url?: string;
}

export interface BreadcrumbItem {
	label: string;
	href?: string | null;
}

export interface PageLike {
	url: string;
	path: string;
	locale?: string | null;
	kind: "content" | "custom";
	pageType: string;
	title: string | null;
	pageTitle?: string | null;
	description: string | null;
	canonical: string | null;
	image: string | null;
	content?: { collection: string; id: string; slug: string | null };
	seo?: {
		ogTitle?: string | null;
		ogDescription?: string | null;
		ogImage?: string | null;
		robots?: string | null;
	};
	articleMeta?: {
		publishedTime?: string | null;
		modifiedTime?: string | null;
		author?: string | null;
		authorUrl?: string | null;
		authorImage?: string | null;
		authorSameAs?: string[] | null;
		authorJobTitle?: string | null;
		authorCredentials?: AuthorCredential[] | null;
	};
	siteName?: string;
	breadcrumbs?: BreadcrumbItem[];
	siteUrl?: string;
}

/** Merchant-configured identity. Everything is optional; absent keys are omitted. */
export interface OrgProfile {
	/** Schema.org type, e.g. "Organization" or "LocalBusiness". */
	type?: string;
	name?: string;
	url?: string;
	logo?: string;
	description?: string;
	/** Verifiable profile URLs, merchant-entered only, never invented. */
	sameAs?: string[];
	telephone?: string;
	email?: string;
	streetAddress?: string;
	addressLocality?: string;
	addressRegion?: string;
	postalCode?: string;
	addressCountry?: string;
	priceRange?: string;
	openingHours?: string[];
}

/**
 * A service the business offers, bound to the page that describes it.
 *
 * Bound by path because a sandboxed plugin has no way to add a per-page
 * editor control (Portable Text blocks are trusted-only). The merchant states
 * "this page is about this service" once, in settings, and we honour it
 * exactly - we never infer a Service from page content.
 */
export interface ServiceDef {
	/** Path this service describes, e.g. "/services/seo". Matched exactly. */
	path: string;
	name: string;
	description?: string;
	/** Schema.org serviceType, e.g. "Search engine optimization". */
	serviceType?: string;
	/** Free-text area served, e.g. "Tampa, FL". */
	areaServed?: string;
}

export interface AeoSettings {
	org?: OrgProfile;
	services?: ServiceDef[];
	authorCredentials?: AuthorCredential[];
	/** Field/sub-field slugs that hold FAQ pairs. Defaults live in extract.ts. */
	faqFields?: string[];
	faqQuestionKeys?: string[];
	faqAnswerKeys?: string[];
	/** Path of the search results page, e.g. "/search". Absent disables SearchAction. */
	searchPath?: string;
	/** Query parameter the search page reads, e.g. "q". */
	searchParam?: string;
	twitterSite?: string;
	twitterCreator?: string;
	/** Collections the indexing report audits. Plugins cannot enumerate them. */
	auditCollections?: string[];
}

type Node = Record<string, unknown>;

// Helpers

/** Drop null/undefined/empty values. JSON-LD validators prefer absent keys. */
export function prune(obj: Node): Node {
	const out: Node = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined || v === null) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		if (typeof v === "string" && v.trim() === "") continue;
		out[k] = v;
	}
	return out;
}

/** Resolve the site origin without throwing on a malformed page.url. */
export function siteOrigin(page: PageLike): string {
	if (page.siteUrl) return page.siteUrl.replace(/\/+$/, "");
	try {
		return new URL(page.url).origin;
	} catch {
		return (page.canonical || page.url || "").replace(/\/+$/, "");
	}
}

/** The page's own canonical URL, falling back to the request URL. */
export function pageUrl(page: PageLike): string {
	return page.canonical || page.url;
}

/**
 * Title-case a URL slug for a derived breadcrumb label.
 * Only used when the theme expressed no opinion.
 */
export function labelFromSegment(segment: string): string {
	return decodeURIComponent(segment)
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve the breadcrumb trail.
 *
 * Contract from PublicPageContext:
 *   undefined  theme has no opinion, so derive from the path
 *   []         this page deliberately has none (e.g. home), so emit none
 *   non-empty  use verbatim
 */
export function resolveBreadcrumbs(page: PageLike): BreadcrumbItem[] {
	if (Array.isArray(page.breadcrumbs)) return page.breadcrumbs;

	const path = (page.path || "/").split("?")[0];
	const segments = path.split("/").filter(Boolean);
	if (segments.length === 0) return [];

	const origin = siteOrigin(page);
	const trail: BreadcrumbItem[] = [{ label: "Home", href: `${origin}/` }];
	let acc = "";
	segments.forEach((seg, i) => {
		acc += `/${seg}`;
		const last = i === segments.length - 1;
		trail.push({
			label: last ? page.pageTitle || page.title || labelFromSegment(seg) : labelFromSegment(seg),
			href: `${origin}${acc}`,
		});
	});
	return trail;
}

// Node builders

export function organizationNode(page: PageLike, settings: AeoSettings): Node | null {
	const org = settings.org ?? {};
	const origin = siteOrigin(page);
	const name = org.name || page.siteName;
	if (!name) return null;

	const addressObj = prune({
		"@type": "PostalAddress",
		streetAddress: org.streetAddress,
		addressLocality: org.addressLocality,
		addressRegion: org.addressRegion,
		postalCode: org.postalCode,
		addressCountry: org.addressCountry,
	});

	return prune({
		"@type": org.type || "Organization",
		"@id": `${origin}/#organization`,
		name,
		url: org.url || origin,
		description: org.description,
		logo: org.logo ? prune({ "@type": "ImageObject", url: org.logo }) : undefined,
		sameAs: org.sameAs?.filter((s) => typeof s === "string" && s.trim() !== ""),
		telephone: org.telephone,
		email: org.email,
		address: Object.keys(addressObj).length > 1 ? addressObj : undefined,
		priceRange: org.priceRange,
		openingHours: org.openingHours && org.openingHours.length > 0 ? org.openingHours : undefined,
	});
}

export function webSiteNode(page: PageLike, settings: AeoSettings, hasOrg: boolean): Node | null {
	const origin = siteOrigin(page);
	const name = page.siteName || settings.org?.name;
	if (!name) return null;

	const searchPath = settings.searchPath;
	const searchParam = settings.searchParam || "q";
	const potentialAction = searchPath
		? {
				"@type": "SearchAction",
				target: {
					"@type": "EntryPoint",
					urlTemplate: `${origin}${searchPath}?${searchParam}={search_term_string}`,
				},
				"query-input": "required name=search_term_string",
			}
		: undefined;

	return prune({
		"@type": "WebSite",
		"@id": `${origin}/#website`,
		name,
		url: `${origin}/`,
		inLanguage: page.locale || undefined,
		publisher: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
		potentialAction,
	});
}

export interface PageSchemaOverride {
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

export function webPageNode(
	page: PageLike,
	hasOrg: boolean,
	hasBreadcrumbs: boolean,
	hasFaq = false,
	override?: PageSchemaOverride | null,
): Node {
	const origin = siteOrigin(page);
	const url = pageUrl(page);
	const image = override?.ogImage || page.seo?.ogImage || page.image;

	// Determine Schema.org @type: explicit override > auto-detection based on path > default WebPage
	let type = override?.schemaType;
	if (!type) {
		const cleanPath = (page.path || "").toLowerCase().replace(/\/+$/, "");
		if (cleanPath === "/about" || cleanPath.endsWith("/about") || cleanPath.endsWith("/about-us")) {
			type = "AboutPage";
		} else if (cleanPath === "/contact" || cleanPath.endsWith("/contact") || cleanPath.endsWith("/contact-us")) {
			type = "ContactPage";
		} else if (cleanPath === "/faq" || cleanPath.endsWith("/faq")) {
			type = "FAQPage";
		} else {
			type = "WebPage";
		}
	}

	return prune({
		"@type": type,
		"@id": `${url}#webpage`,
		url,
		name: override?.ogTitle || page.seo?.ogTitle || page.pageTitle || page.title,
		description: override?.ogDescription || page.seo?.ogDescription || page.description,
		inLanguage: page.locale || undefined,
		isPartOf: { "@id": `${origin}/#website` },
		about: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
		primaryImageOfPage: image ? prune({ "@type": "ImageObject", url: image }) : undefined,
		breadcrumb: hasBreadcrumbs ? { "@id": `${url}#breadcrumb` } : undefined,
		mainEntity: hasFaq ? { "@id": `${url}#faq` } : undefined,
		datePublished: page.articleMeta?.publishedTime || undefined,
		dateModified: page.articleMeta?.modifiedTime || undefined,
	});
}

export function breadcrumbNode(page: PageLike, items: BreadcrumbItem[]): Node | null {
	if (items.length === 0) return null;
	const url = pageUrl(page);

	return {
		"@type": "BreadcrumbList",
		"@id": `${url}#breadcrumb`,
		itemListElement: items.map((item, i) =>
			prune({
				"@type": "ListItem",
				position: i + 1,
				name: item.label,
				item: item.href || undefined,
			}),
		),
	};
}

export function personNode(page: PageLike, settings: AeoSettings, hasOrg: boolean): Node | null {
	const meta = page.articleMeta;
	const name = meta?.author;
	if (!name) return null;

	const origin = siteOrigin(page);
	const authorUrl = meta.authorUrl;
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	const id = authorUrl
		? (authorUrl.includes("#") ? authorUrl : `${authorUrl}#author`)
		: `${origin}/#author-${slug}`;

	const rawCredentials: AuthorCredential[] = [
		...(meta.authorCredentials ?? []),
		...(settings.authorCredentials ?? []).filter(
			(c) => !c.author || c.author.toLowerCase() === name.toLowerCase(),
		),
	];

	const credentials = rawCredentials.map((c) =>
		prune({
			"@type": "EducationalOccupationalCredential",
			name: c.name,
			url: c.url || undefined,
		}),
	);

	return prune({
		"@type": "Person",
		"@id": id,
		name,
		url: authorUrl || undefined,
		image: meta.authorImage ? prune({ "@type": "ImageObject", url: meta.authorImage }) : undefined,
		jobTitle: meta.authorJobTitle || undefined,
		sameAs: meta.authorSameAs?.filter((s) => typeof s === "string" && s.trim() !== ""),
		hasCredential: credentials.length > 0 ? credentials : undefined,
		worksFor: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
	});
}

export function articleNode(
	page: PageLike,
	hasOrg: boolean,
	personId?: string | null,
	override?: PageSchemaOverride | null,
): Node | null {
	if (page.pageType !== "article") return null;
	const origin = siteOrigin(page);
	const url = pageUrl(page);
	const authorName = page.articleMeta?.author;
	const image = override?.ogImage || page.seo?.ogImage || page.image;
	const published = page.articleMeta?.publishedTime;
	const modified = page.articleMeta?.modifiedTime;

	const authorProp = personId
		? { "@id": personId }
		: authorName
			? { "@type": "Person", name: authorName }
			: undefined;

	const type = override?.articleType || "BlogPosting";

	return prune({
		"@type": type,
		"@id": `${url}#article`,
		headline: override?.ogTitle || page.seo?.ogTitle || page.pageTitle || page.title,
		description: override?.ogDescription || page.seo?.ogDescription || page.description,
		image: image ? prune({ "@type": "ImageObject", url: image }) : undefined,
		url,
		datePublished: published || undefined,
		dateModified: modified || published || undefined,
		inLanguage: page.locale || undefined,
		author: authorProp,
		publisher: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
		isPartOf: { "@id": `${url}#webpage` },
		mainEntityOfPage: { "@id": `${url}#webpage` },
	});
}

/**
 * FAQPage built from merchant-authored Q&A pairs.
 * Returns null for an empty list rather than an empty FAQPage, which is
 * invalid markup and reads to a crawler as a broken page.
 */
export function faqNode(page: PageLike, pairs: FaqPair[]): Node | null {
	if (pairs.length === 0) return null;
	const url = pageUrl(page);

	return {
		"@type": "FAQPage",
		"@id": `${url}#faq`,
		mainEntity: pairs.map((pair) => ({
			"@type": "Question",
			name: pair.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: pair.answer,
			},
		})),
	};
}

/** Service for the page the merchant bound it to, via per-page override or settings. */
export function serviceNode(
	page: PageLike,
	settings: AeoSettings,
	hasOrg: boolean,
	override?: PageSchemaOverride | null,
): Node | null {
	const origin = siteOrigin(page);
	const url = pageUrl(page);

	// 1. Direct page override takes precedence
	if (override?.serviceName) {
		return prune({
			"@type": "Service",
			"@id": `${url}#service`,
			name: override.serviceName,
			description: override.serviceDescription || override.ogDescription || page.description,
			serviceType: override.serviceType,
			areaServed: override.serviceAreaServed,
			provider: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
		});
	}

	// 2. Settings services matched by path
	const services = settings.services;
	if (!services || services.length === 0) return null;

	const path = (page.path || "/").split("?")[0].replace(/\/+$/, "") || "/";
	const match = services.find((s) => {
		const candidate = (s.path || "").split("?")[0].replace(/\/+$/, "") || "/";
		return candidate === path;
	});
	if (!match || !match.name) return null;

	return prune({
		"@type": "Service",
		"@id": `${url}#service`,
		name: match.name,
		description: match.description,
		serviceType: match.serviceType,
		areaServed: match.areaServed,
		provider: hasOrg ? { "@id": `${origin}/#organization` } : undefined,
	});
}

// Top-level graph

/**
 * Build the connected @graph for a page.
 * Returns null when there is nothing meaningful to say.
 */
export function buildAeoGraph(
	page: PageLike,
	settings: AeoSettings = {},
	extras: { faq?: FaqPair[]; override?: PageSchemaOverride | null } = {},
): Node | null {
	const override = extras.override;
	const org = organizationNode(page, settings);
	const hasOrg = org !== null;

	const crumbs = resolveBreadcrumbs(page);
	const breadcrumb = breadcrumbNode(page, crumbs);

	const faq = faqNode(page, extras.faq ?? []);
	const person = personNode(page, settings, hasOrg);

	const nodes: Node[] = [];
	if (org) nodes.push(org);

	const site = webSiteNode(page, settings, hasOrg);
	if (site) nodes.push(site);

	nodes.push(webPageNode(page, hasOrg, breadcrumb !== null, faq !== null, override));
	if (breadcrumb) nodes.push(breadcrumb);

	if (person) nodes.push(person);

	const article = articleNode(page, hasOrg, person ? (person["@id"] as string) : null, override);
	if (article) nodes.push(article);

	if (faq) nodes.push(faq);

	const service = serviceNode(page, settings, hasOrg, override);
	if (service) nodes.push(service);

	// Custom Schema JSON-LD snippet
	if (override?.customSchemaJson) {
		try {
			const parsed = JSON.parse(override.customSchemaJson);
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (item && typeof item === "object") nodes.push(item);
				}
			} else if (parsed && typeof parsed === "object") {
				if (Array.isArray((parsed as any)["@graph"])) {
					nodes.push(...(parsed as any)["@graph"]);
				} else {
					nodes.push(parsed);
				}
			}
		} catch {
			// Malformed custom JSON is silently ignored to prevent breaking page markup
		}
	}

	if (nodes.length === 0) return null;
	return { "@context": "https://schema.org", "@graph": nodes };
}
