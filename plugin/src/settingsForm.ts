/**
 * Settings form - pure serialisation between AeoSettings and Block Kit values.
 *
 * Block Kit forms are flat: there is no repeater input. Lists are therefore
 * entered as one item per line, and structured lists (services) as
 * pipe-separated columns. Parsing follows one rule throughout: a line we
 * cannot read is REPORTED, never silently dropped. A merchant who mistypes a
 * service row should be told the row was skipped, not left believing the
 * schema is live on that page.
 */

import type { AeoSettings, AuthorCredential, OrgProfile, ServiceDef } from "./graph.ts";

export interface ParseResult {
	settings: AeoSettings;
	/** Human-readable notes about lines that could not be used. */
	warnings: string[];
}

type FormValues = Record<string, unknown>;

// Serialisation helpers

function str(values: FormValues, key: string): string {
	const value = values[key];
	return typeof value === "string" ? value.trim() : "";
}

/** Split a textarea into trimmed, non-empty lines. */
export function lines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

/** Split a comma-or-space separated list into trimmed, non-empty tokens. */
export function tokens(value: string): string[] {
	return value
		.split(/[,\s]+/)
		.map((token) => token.trim())
		.filter((token) => token !== "");
}

/**
 * Parse one service row: `path | name | serviceType | areaServed | description`
 * Only path and name are required; trailing columns may be omitted.
 */
export function parseServiceLine(line: string): ServiceDef | null {
	const parts = line.split("|").map((part) => part.trim());
	const [path, name, serviceType, areaServed, description] = parts;
	if (!path || !name) return null;
	if (!path.startsWith("/")) return null;

	const service: ServiceDef = { path, name };
	if (serviceType) service.serviceType = serviceType;
	if (areaServed) service.areaServed = areaServed;
	if (description) service.description = description;
	return service;
}

/**
 * Parse one author credential row: `[Author Name |] Certification Name | Verification URL`
 */
export function parseAuthorCredentialLine(line: string): AuthorCredential | null {
	const parts = line.split("|").map((part) => part.trim());
	if (parts.length === 1) {
		const [name] = parts;
		if (!name) return null;
		return { name };
	} else if (parts.length === 2) {
		const [first, second] = parts;
		if (!first || !second) return null;
		if (/^https?:\/\//i.test(second)) {
			return { name: first, url: second };
		}
		return { author: first, name: second };
	} else if (parts.length >= 3) {
		const [author, name, url] = parts;
		if (!name) return null;
		return { author, name, url: /^https?:\/\//i.test(url) ? url : undefined };
	}
	return null;
}

/** Build AeoSettings from submitted form values. */
export function formValuesToSettings(values: FormValues): ParseResult {
	const warnings: string[] = [];

	const org: OrgProfile = {};
	const orgType = str(values, "org_type");
	const orgName = str(values, "org_name");
	if (orgType) org.type = orgType;
	if (orgName) org.name = orgName;
	const orgUrl = str(values, "org_url");
	if (orgUrl) org.url = orgUrl;
	const orgLogo = str(values, "org_logo");
	if (orgLogo) org.logo = orgLogo;
	const orgDescription = str(values, "org_description");
	if (orgDescription) org.description = orgDescription;
	const orgPhone = str(values, "org_telephone");
	if (orgPhone) org.telephone = orgPhone;
	const orgEmail = str(values, "org_email");
	if (orgEmail) org.email = orgEmail;
	const streetAddress = str(values, "org_street_address");
	if (streetAddress) org.streetAddress = streetAddress;
	const addressLocality = str(values, "org_address_locality");
	if (addressLocality) org.addressLocality = addressLocality;
	const addressRegion = str(values, "org_address_region");
	if (addressRegion) org.addressRegion = addressRegion;
	const postalCode = str(values, "org_address_postal_code");
	if (postalCode) org.postalCode = postalCode;
	const addressCountry = str(values, "org_address_country");
	if (addressCountry) org.addressCountry = addressCountry;
	const priceRange = str(values, "org_price_range");
	if (priceRange) org.priceRange = priceRange;
	const openingHours = lines(str(values, "org_opening_hours"));
	if (openingHours.length > 0) org.openingHours = openingHours;

	const sameAs = lines(str(values, "org_same_as"));
	const badSameAs = sameAs.filter((url) => !/^https?:\/\//i.test(url));
	const goodSameAs = sameAs.filter((url) => /^https?:\/\//i.test(url));
	if (badSameAs.length > 0) {
		warnings.push(
			`${badSameAs.length} profile ${badSameAs.length === 1 ? "URL was" : "URLs were"} ignored: a sameAs entry must be a full http(s) URL.`,
		);
	}
	if (goodSameAs.length > 0) org.sameAs = goodSameAs;

	const serviceLines = lines(str(values, "services"));
	const services: ServiceDef[] = [];
	let badServices = 0;
	for (const line of serviceLines) {
		const parsed = parseServiceLine(line);
		if (parsed) services.push(parsed);
		else badServices += 1;
	}
	if (badServices > 0) {
		warnings.push(
			`${badServices} service ${badServices === 1 ? "row was" : "rows were"} skipped. Each row needs at least "/path | Name", and the path must start with "/".`,
		);
	}

	const credLines = lines(str(values, "author_credentials"));
	const authorCredentials: AuthorCredential[] = [];
	let badCreds = 0;
	for (const line of credLines) {
		const parsed = parseAuthorCredentialLine(line);
		if (parsed) authorCredentials.push(parsed);
		else badCreds += 1;
	}
	if (badCreds > 0) {
		warnings.push(
			`${badCreds} author credential ${badCreds === 1 ? "row was" : "rows were"} skipped. Each row needs a certification name.`,
		);
	}

	const settings: AeoSettings = {};
	if (Object.keys(org).length > 0) settings.org = org;
	if (services.length > 0) settings.services = services;
	if (authorCredentials.length > 0) settings.authorCredentials = authorCredentials;

	const searchPath = str(values, "search_path");
	if (searchPath) {
		if (searchPath.startsWith("/")) settings.searchPath = searchPath;
		else warnings.push('Search path ignored: it must start with "/", for example /search.');
	}
	const searchParam = str(values, "search_param");
	if (searchParam) settings.searchParam = searchParam;

	const twitterSite = str(values, "twitter_site");
	if (twitterSite) settings.twitterSite = twitterSite;
	const twitterCreator = str(values, "twitter_creator");
	if (twitterCreator) settings.twitterCreator = twitterCreator;

	const faqFields = tokens(str(values, "faq_fields"));
	if (faqFields.length > 0) settings.faqFields = faqFields;
	const faqQuestionKeys = tokens(str(values, "faq_question_keys"));
	if (faqQuestionKeys.length > 0) settings.faqQuestionKeys = faqQuestionKeys;
	const faqAnswerKeys = tokens(str(values, "faq_answer_keys"));
	if (faqAnswerKeys.length > 0) settings.faqAnswerKeys = faqAnswerKeys;

	const auditCollections = tokens(str(values, "audit_collections"));
	if (auditCollections.length > 0) settings.auditCollections = auditCollections;

	return { settings, warnings };
}

/** Render a service list back into editable rows. */
export function servicesToText(services: ServiceDef[] | undefined): string {
	if (!services || services.length === 0) return "";
	return services
		.map((s) => {
			const columns = [s.path, s.name, s.serviceType ?? "", s.areaServed ?? "", s.description ?? ""];
			// Drop trailing empty columns so an unused field does not come back
			// as a row of dangling pipes the merchant has to clean up by hand.
			while (columns.length > 2 && columns[columns.length - 1] === "") columns.pop();
			return columns.join(" | ");
		})
		.join("\n");
}

/** Render an author credential list back into editable rows. */
export function authorCredentialsToText(credentials: AuthorCredential[] | undefined): string {
	if (!credentials || credentials.length === 0) return "";
	return credentials
		.map((c) => {
			if (c.author) {
				return c.url ? `${c.author} | ${c.name} | ${c.url}` : `${c.author} | ${c.name}`;
			}
			return c.url ? `${c.name} | ${c.url}` : c.name;
		})
		.join("\n");
}

type Block = Record<string, unknown>;

/** Render the settings page, pre-filled from stored settings. */
export function buildSettingsBlocks(settings: AeoSettings): { blocks: Block[] } {
	const org = settings.org ?? {};

	return {
		blocks: [
			{ type: "header", text: "AEO settings" },
			{
				type: "context",
				text: "Everything here is published as structured data exactly as you enter it. Nothing on this page is guessed or inferred from your content.",
			},
			{
				type: "form",
				block_id: "aeo_settings",
				fields: [
					{
						type: "text_input",
						action_id: "org_name",
						label: "Organization name",
						placeholder: "Leave blank to use the site title",
						initial_value: org.name ?? "",
					},
					{
						type: "text_input",
						action_id: "org_type",
						label: "Schema.org type",
						placeholder: "Organization",
						initial_value: org.type ?? "",
					},
					{
						type: "text_input",
						action_id: "org_url",
						label: "Organization URL",
						placeholder: "https://example.com",
						initial_value: org.url ?? "",
					},
					{
						type: "text_input",
						action_id: "org_logo",
						label: "Logo URL",
						placeholder: "https://example.com/logo.png",
						initial_value: org.logo ?? "",
					},
					{
						type: "text_input",
						action_id: "org_description",
						label: "Short description",
						multiline: true,
						initial_value: org.description ?? "",
					},
					{
						type: "text_input",
						action_id: "org_telephone",
						label: "Telephone",
						initial_value: org.telephone ?? "",
					},
					{
						type: "text_input",
						action_id: "org_email",
						label: "Email",
						initial_value: org.email ?? "",
					},
					{
						type: "text_input",
						action_id: "org_street_address",
						label: "Street Address",
						placeholder: "100 Main St",
						initial_value: org.streetAddress ?? "",
					},
					{
						type: "text_input",
						action_id: "org_address_locality",
						label: "City / Locality",
						placeholder: "Tampa",
						initial_value: org.addressLocality ?? "",
					},
					{
						type: "text_input",
						action_id: "org_address_region",
						label: "State / Region",
						placeholder: "FL",
						initial_value: org.addressRegion ?? "",
					},
					{
						type: "text_input",
						action_id: "org_address_postal_code",
						label: "Postal Code",
						placeholder: "33602",
						initial_value: org.postalCode ?? "",
					},
					{
						type: "text_input",
						action_id: "org_address_country",
						label: "Country",
						placeholder: "US",
						initial_value: org.addressCountry ?? "",
					},
					{
						type: "text_input",
						action_id: "org_price_range",
						label: "Price Range",
						placeholder: "$$",
						initial_value: org.priceRange ?? "",
					},
					{
						type: "text_input",
						action_id: "org_opening_hours",
						label: "Opening Hours (one per line, e.g. Mo-Fr 09:00-17:00)",
						multiline: true,
						initial_value: (org.openingHours ?? []).join("\n"),
					},
					{
						type: "text_input",
						action_id: "org_same_as",
						label: "Profile URLs (one per line)",
						placeholder: "https://www.facebook.com/yourpage",
						multiline: true,
						initial_value: (org.sameAs ?? []).join("\n"),
					},
					{
						type: "text_input",
						action_id: "services",
						label: "Services - one per line: /path | Name | Type | Area served | Description",
						placeholder: "/pages/ac-repair | Air Conditioning Repair | HVAC repair | Tampa, FL",
						multiline: true,
						initial_value: servicesToText(settings.services),
					},
					{
						type: "text_input",
						action_id: "author_credentials",
						label: "Author Certifications - one per line: [Author Name |] Certification Name | Verification URL",
						placeholder: "Alex Rivera | Master HVAC Certification | https://example.edu/cert/123",
						multiline: true,
						initial_value: authorCredentialsToText(settings.authorCredentials),
					},
					{
						type: "text_input",
						action_id: "search_path",
						label: "Search page path",
						placeholder: "/search",
						initial_value: settings.searchPath ?? "",
					},
					{
						type: "text_input",
						action_id: "search_param",
						label: "Search query parameter",
						placeholder: "q",
						initial_value: settings.searchParam ?? "",
					},
					{
						type: "text_input",
						action_id: "twitter_site",
						label: "X / Twitter site handle",
						placeholder: "@yourbusiness",
						initial_value: settings.twitterSite ?? "",
					},
					{
						type: "text_input",
						action_id: "twitter_creator",
						label: "X / Twitter creator handle",
						initial_value: settings.twitterCreator ?? "",
					},
					{
						type: "text_input",
						action_id: "faq_fields",
						label: "FAQ repeater field names",
						placeholder: "faq, faqs, questions",
						initial_value: (settings.faqFields ?? []).join(", "),
					},
					{
						type: "text_input",
						action_id: "faq_question_keys",
						label: "FAQ question sub-field names",
						placeholder: "question, q, title",
						initial_value: (settings.faqQuestionKeys ?? []).join(", "),
					},
					{
						type: "text_input",
						action_id: "faq_answer_keys",
						label: "FAQ answer sub-field names",
						placeholder: "answer, a, response, body",
						initial_value: (settings.faqAnswerKeys ?? []).join(", "),
					},
					{
						type: "text_input",
						action_id: "audit_collections",
						label: "Collections to audit on the Indexing page",
						placeholder: "posts, pages",
						initial_value: (settings.auditCollections ?? []).join(", "),
					},
				],
				submit: { label: "Save settings", action_id: "save_settings" },
			},
			{
				type: "context",
				text: "Blank fields fall back to defaults: the site title for the organization name, Organization for the type, and posts and pages for the audit.",
			},
		],
	};
}
