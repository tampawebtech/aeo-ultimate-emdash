/**
 * Pure extraction from a ContentItem's `data` bag.
 *
 * Why a repeater field and not heading heuristics: a marketplace (sandboxed)
 * plugin cannot register Portable Text block types - those are trusted-only -
 * so there is no way to give the merchant a first-class "FAQ block". The
 * alternative would be sniffing the body for "heading followed by paragraph"
 * and calling it a question. We don't do that. Wrong FAQ markup is worse than
 * none: it misrepresents the page to Google and to answer engines, and the
 * merchant never asked for it. A repeater field the merchant filled in on
 * purpose is an explicit statement, which is the only thing worth publishing.
 */

export interface FaqPair {
	question: string;
	answer: string;
}

/** Field/sub-field slugs to look for. All configurable; these are the defaults. */
export interface FaqFieldMap {
	/** Repeater field slugs to try, in order. */
	fields?: string[];
	/** Sub-field slugs holding the question, in order. */
	questionKeys?: string[];
	/** Sub-field slugs holding the answer, in order. */
	answerKeys?: string[];
}

export const DEFAULT_FAQ_FIELDS = ["faq", "faqs", "questions"];
export const DEFAULT_QUESTION_KEYS = ["question", "q", "title"];
export const DEFAULT_ANSWER_KEYS = ["answer", "a", "response", "body"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First non-empty string found under any of `keys`. */
function pickString(row: Record<string, unknown>, keys: string[]): string | null {
	for (const key of keys) {
		const value = row[key];
		if (typeof value === "string" && value.trim() !== "") return value.trim();
	}
	return null;
}

/**
 * Pull FAQ pairs out of a content item's data bag.
 *
 * Returns [] for anything it cannot read confidently - a missing field, a
 * non-array value, rows that are not objects, or rows missing either half of
 * the pair. A half-populated row is skipped rather than emitted with an empty
 * answer, because an FAQPage entry with no answer is invalid markup.
 */
export function extractFaqPairs(
	data: unknown,
	map: FaqFieldMap = {},
): FaqPair[] {
	if (!isRecord(data)) return [];

	const fields = map.fields?.length ? map.fields : DEFAULT_FAQ_FIELDS;
	const questionKeys = map.questionKeys?.length ? map.questionKeys : DEFAULT_QUESTION_KEYS;
	const answerKeys = map.answerKeys?.length ? map.answerKeys : DEFAULT_ANSWER_KEYS;

	for (const field of fields) {
		const raw = data[field];
		if (!Array.isArray(raw)) continue;

		const pairs: FaqPair[] = [];
		for (const row of raw) {
			if (!isRecord(row)) continue;
			const question = pickString(row, questionKeys);
			const answer = pickString(row, answerKeys);
			if (question && answer) pairs.push({ question, answer });
		}
		if (pairs.length > 0) return pairs;
	}

	return [];
}
