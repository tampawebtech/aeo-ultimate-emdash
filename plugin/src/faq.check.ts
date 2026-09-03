import { extractFaqPairs } from "./extract.ts";
import { buildAeoGraph, type PageLike } from "./graph.ts";

const page: PageLike = {
  url: "http://localhost:4321/services/seo",
  path: "/services/seo",
  locale: null,
  kind: "content",
  pageType: "page",
  title: "SEO Services",
  description: "What we do",
  canonical: "http://localhost:4321/services/seo",
  image: null,
  content: { collection: "pages", id: "p1", slug: "seo" },
  siteName: "My Blog",
};

const data = {
  faq: [
    { question: "How long does it take?", answer: "Usually 4 to 6 weeks." },
    { question: "Do you offer refunds?", answer: "Yes, within 30 days." },
    { question: "Missing answer?" },
    "not an object",
  ],
};

const pairs = extractFaqPairs(data);
console.log("PAIRS:", JSON.stringify(pairs));
console.log("EMPTY DATA ->", JSON.stringify(extractFaqPairs({})), JSON.stringify(extractFaqPairs(null)));

const settings = {
  org: { name: "Tampa Web Tech" },
  services: [{ path: "/services/seo", name: "SEO", description: "Search optimization", serviceType: "SEO", areaServed: "Tampa, FL" }],
};

const g = buildAeoGraph(page, settings, { faq: pairs }) as any;
console.log("TYPES:", g["@graph"].map((n: any) => n["@type"]).join(", "));
const wp = g["@graph"].find((n: any) => n["@type"] === "WebPage");
console.log("WebPage.mainEntity:", JSON.stringify(wp.mainEntity));
console.log("FAQPage:", JSON.stringify(g["@graph"].find((n: any) => n["@type"] === "FAQPage"), null, 1));
console.log("Service:", JSON.stringify(g["@graph"].find((n: any) => n["@type"] === "Service"), null, 1));
