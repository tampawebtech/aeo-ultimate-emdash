/**
 * Content-based extraction for social metadata and image alt text.
 *
 * 100% pure, local logic — no external network requests, no AI API calls,
 * no token costs. Safely extracts plain text, titles, social descriptions,
 * image references, and alt text candidates from EmDash content records.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extract plain text from Portable Text blocks or strings.
 */
export function extractPlainTextFromPortableText(content: unknown): string {
	if (typeof content === "string") {
		// Strip any HTML tags (common in content migrated from WordPress)
		return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
	}
	if (!Array.isArray(content)) {
		return "";
	}

	const parts: string[] = [];

	for (const block of content) {
		if (!isRecord(block)) continue;

		// Standard Portable Text block
		if (Array.isArray(block.children)) {
			const blockText = block.children
				.map((child) => (isRecord(child) && typeof child.text === "string" ? child.text : ""))
				.join("")
				.trim();
			if (blockText) parts.push(blockText);
		} else if (typeof block.text === "string" && block.text.trim()) {
			parts.push(block.text.trim());
		}
	}

	return parts.join(" ");
}

/**
 * Truncate text cleanly to a maximum length (default 155 chars for meta description),
 * avoiding cut-offs in the middle of words.
 */
export function truncateSocialDescription(text: string, maxLength = 155): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	if (cleaned.length <= maxLength) return cleaned;

	// Cut off at the nearest word boundary before maxLength - 3 (for "...")
	const candidate = cleaned.slice(0, maxLength - 3);
	const lastSpace = candidate.lastIndexOf(" ");
	if (lastSpace > 40) {
		return candidate.slice(0, lastSpace).trim() + "...";
	}
	return candidate.trim() + "...";
}

/**
 * Derive an Open Graph / meta description from an entry's content bag.
 * Looks for `excerpt` first, then falls back to Portable Text `content`.
 */
export function extractSocialDescription(data: unknown, maxLength = 155): string | null {
	if (!isRecord(data)) return null;

	// 1. Explicit excerpt field
	if (typeof data.excerpt === "string" && data.excerpt.trim()) {
		return truncateSocialDescription(data.excerpt, maxLength);
	}

	// 2. Body content (Portable Text or string)
	if (data.content) {
		const plainText = extractPlainTextFromPortableText(data.content);
		if (plainText) {
			return truncateSocialDescription(plainText, maxLength);
		}
	}

	// 3. Fallback to short description field if present
	if (typeof data.description === "string" && data.description.trim()) {
		return truncateSocialDescription(data.description, maxLength);
	}

	return null;
}

/**
 * Derive an Open Graph title from content data or URL slug.
 */
export function extractSocialTitle(data: unknown, fallbackSlug?: string | null): string | null {
	if (isRecord(data) && typeof data.title === "string" && data.title.trim()) {
		return data.title.trim();
	}
	if (fallbackSlug && fallbackSlug.trim()) {
		return fallbackSlug
			.replace(/[-_]+/g, " ")
			.trim()
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}
	return null;
}

export interface ExtractedImage {
	url: string;
	alt: string | null;
	filename?: string | null;
	sourceField: string;
}

/**
 * Extract image URL and alt text from content data (featured_image or embedded).
 */
export function extractSocialImage(data: unknown): ExtractedImage | null {
	if (!isRecord(data)) return null;

	// Common image fields
	const candidates: Array<{ field: string; val: unknown }> = [
		{ field: "featured_image", val: data.featured_image },
		{ field: "image", val: data.image },
		{ field: "hero_image", val: data.hero_image },
		{ field: "cover_image", val: data.cover_image },
	];

	for (const { field, val } of candidates) {
		if (!val) continue;

		// 1. Simple URL string
		if (typeof val === "string" && val.trim()) {
			return {
				url: val.trim(),
				alt: null,
				sourceField: field,
			};
		}

		// 2. Object formats
		if (isRecord(val)) {
			// EmDash $media shape
			if (isRecord(val.$media)) {
				const media = val.$media;
				const url = typeof media.url === "string" ? media.url : typeof media.src === "string" ? media.src : null;
				if (url) {
					return {
						url,
						alt: typeof media.alt === "string" && media.alt.trim() ? media.alt.trim() : null,
						filename: typeof media.filename === "string" ? media.filename : null,
						sourceField: field,
					};
				}
			}

			// EmDash standard media object { mediaId, alt, url }
			if (typeof val.mediaId === "string" && val.mediaId.trim()) {
				const mediaId = val.mediaId.trim();
				const url = typeof val.url === "string" ? val.url : `/_emdash/api/media/file/${mediaId}`;
				return {
					url,
					alt: typeof val.alt === "string" && val.alt.trim() ? val.alt.trim() : null,
					filename: typeof val.filename === "string" ? val.filename : null,
					sourceField: field,
				};
			}

			// Standard { src, alt } or { url, alt }
			const url = typeof val.src === "string" ? val.src : typeof val.url === "string" ? val.url : null;
			if (url) {
				return {
					url,
					alt: typeof val.alt === "string" && val.alt.trim() ? val.alt.trim() : null,
					filename: typeof val.filename === "string" ? val.filename : null,
					sourceField: field,
				};
			}
		}
	}

	// Also check Portable Text content for an embedded image block
	if (Array.isArray(data.content)) {
		for (const block of data.content) {
			if (!isRecord(block)) continue;
			if (block._type === "image") {
				const url =
					typeof block.url === "string"
						? block.url
						: typeof block.src === "string"
							? block.src
							: isRecord(block.asset) && typeof block.asset.url === "string"
								? block.asset.url
								: null;
				if (url) {
					return {
						url,
						alt: typeof block.alt === "string" && block.alt.trim() ? block.alt.trim() : null,
						sourceField: "content.image",
					};
				}
			}
		}
	}

	return null;
}

/**
 * Generate a natural, descriptive alt text based on post title, context, and filename.
 */
export function generateContentAltText(title?: string | null, filename?: string | null): string {
	if (title && title.trim()) {
		return `Illustration for ${title.trim()}`;
	}
	if (filename && filename.trim()) {
		// Clean up filename: remove extension and replace dashes/underscores
		const base = filename.replace(/\.[a-zA-Z0-9]+$/, "");
		const words = base.replace(/[-_]+/g, " ").trim();
		if (words) {
			return words.charAt(0).toUpperCase() + words.slice(1);
		}
	}
	return "Cover image";
}

/**
 * Detect if the entry has an image that is missing alt text.
 */
export function detectMissingAlt(
	data: unknown,
	pageTitle?: string | null,
): { hasMissingAlt: boolean; imageField?: string; currentUrl?: string; suggestedAlt?: string } {
	const image = extractSocialImage(data);
	if (!image) {
		return { hasMissingAlt: false };
	}

	if (!image.alt || image.alt.trim() === "") {
		return {
			hasMissingAlt: true,
			imageField: image.sourceField,
			currentUrl: image.url,
			suggestedAlt: generateContentAltText(pageTitle, image.filename),
		};
	}

	return { hasMissingAlt: false };
}

/**
 * Update content data with new alt text on the appropriate image field.
 * Returns a shallow copy of data with the updated field.
 */
export function applyAltTextUpdate(
	data: Record<string, unknown>,
	field: string,
	newAlt: string,
): Record<string, unknown> {
	const current = data[field];
	if (!current) return data;

	if (typeof current === "string") {
		return {
			...data,
			[field]: { src: current, alt: newAlt },
		};
	}

	if (isRecord(current)) {
		if (isRecord(current.$media)) {
			return {
				...data,
				[field]: {
					...current,
					$media: {
						...current.$media,
						alt: newAlt,
					},
				},
			};
		}

		return {
			...data,
			[field]: {
				...current,
				alt: newAlt,
			},
		};
	}

	return data;
}
