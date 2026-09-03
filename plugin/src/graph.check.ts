// Scratch check: run with `node src/graph.check.ts` (Node strips types natively).
import { buildAeoGraph, resolveBreadcrumbs, type PageLike } from "./graph.ts";

const post: PageLike = {
	url: "http://localhost:4321/posts/a-weekend-with-a-side-project",
	path: "/posts/a-weekend-with-a-side-project",
	locale: "en-US",
	kind: "content",
	pageType: "article",
	title: "A Weekend with a Side Project — My Blog",
	pageTitle: "A Weekend with a Side Project",
	description: "No stakeholders, no deadlines, no Jira tickets.",
	canonical: "http://localhost:4321/posts/a-weekend-with-a-side-project",
	image: "http://localhost:4321/_emdash/api/media/file/01M1.jpg",
	content: { collection: "posts", id: "01M1", slug: "a-weekend-with-a-side-project" },
	seo: { ogImage: "http://localhost:4321/_emdash/api/media/file/01M1.jpg" },
	articleMeta: {
		publishedTime: "2026-09-03T02:26:52.278Z",
		modifiedTime: "2026-09-03T02:26:52.283Z",
		author: "Alex Rivera",
		authorUrl: "http://localhost:4321/authors/alex-rivera",
		authorJobTitle: "Lead Technical Writer",
		authorSameAs: ["https://twitter.com/alexrivera", "https://github.com/alexrivera"],
		authorCredentials: [
			{ name: "Certified Web Engineer", url: "https://example.edu/certs/web-engineer" },
		],
	},
	siteName: "My Blog",
};

const home: PageLike = {
	url: "http://localhost:4321/",
	path: "/",
	locale: "en-US",
	kind: "custom",
	pageType: "home",
	title: "My Blog",
	description: "Thoughts on building for the web",
	canonical: "http://localhost:4321/",
	image: null,
	siteName: "My Blog",
};

const settings = {
	org: {
		name: "My Blog",
		type: "HVACBusiness",
		url: "http://localhost:4321",
		logo: "http://localhost:4321/logo.png",
		sameAs: ["https://github.com/example", ""],
		streetAddress: "100 Main St",
		addressLocality: "Tampa",
		addressRegion: "FL",
		postalCode: "33602",
		addressCountry: "US",
		priceRange: "$$",
		openingHours: ["Mo-Fr 09:00-17:00"],
	},
	searchPath: "/search",
	searchParam: "q",
};

console.log("=== POST ===");
console.log(JSON.stringify(buildAeoGraph(post, settings), null, 1));
console.log("=== HOME (breadcrumbs should be empty) ===");
console.log("crumbs:", JSON.stringify(resolveBreadcrumbs(home)));
console.log(JSON.stringify(buildAeoGraph(home, settings), null, 1));
console.log("=== THEME SAYS NO BREADCRUMBS ([]) ===");
console.log("crumbs:", JSON.stringify(resolveBreadcrumbs({ ...post, breadcrumbs: [] })));
