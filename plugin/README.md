# AEO Ultimate for EmDash

> **Answer Engine Optimization & Connected Schema.org Graph for EmDash CMS**

A comprehensive, sandboxed SEO and AEO plugin for [EmDash](https://emdashcms.com). AEO Ultimate connects your site's content into a unified, interconnected Schema.org entity graph (Organization, WebSite, WebPage, Article, Service, FAQ, Breadcrumbs, Offers) and provides a unified Open Graph & Twitter Card manager with 1-click bulk content automations.

---

## Features

* **Connected Schema.org Entity Graph**: Emits a single, linked `@graph` (under `id: "primary"`) replacing disconnected islands with rich, Google-compliant structured data.
* **Unified Social & Schema Manager**: Audit and customize Open Graph tags, Twitter/X cards, and Schema.org types (`WebPage`, `AboutPage`, `ContactPage`, `FAQPage`, `ItemPage`, `Service`) from one screen.
* **1-Click Content-Based Bulk Automation**:
  * Fill missing social descriptions (extracted and truncated on word boundaries from page content).
  * Fill missing Open Graph titles.
  * Map missing share images from featured and embedded media.
  * Auto-generate accessible image alt texts.
  * Auto-detect and apply `AboutPage`, `ContactPage`, and `Service` schemas.
* **100% Free & Local**: Zero external network calls (`allowedHosts: []`). Operates with zero API costs and instant execution.
* **Per-Page Overrides**: Stored in isolated plugin KV (`ctx.kv`), preserving your configuration across deployments without touching core database schemas.

---

## Installation

```bash
npm install aeoultimate-emdash
```

Then register it in `astro.config.mjs` and restart the dev server:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import aeoPlugin from "aeoultimate-emdash";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [aeoPlugin],
    }),
  ],
});
```

---

## Admin Pages

Once installed, AEO Ultimate adds the following screens under **Admin > Plugins**:

* **Social & Schema** (`/_emdash/admin/plugins/aeo-ultimate/social`): Audit coverage across audited collections, run bulk actions, and customize metadata per page.
* **Indexing Audit** (`/_emdash/admin/plugins/aeo-ultimate/indexing`): Scan all collections for search-engine visibility and noindex status.
* **AEO Settings** (`/_emdash/admin/plugins/aeo-ultimate/settings`): Configure business identity, services, credentials, and site search parameters.

---

## Security & Capabilities

This plugin runs in EmDash's security sandbox with the following permissions:
* `content:read`: Auditing collections and extracting summaries.
* `content:write`: Updating item SEO fields and media alt text during bulk actions.
* `allowedHosts: []`: Strictly offline with no external outbound network access.

---

## Agent Skill

The npm package ships an agent skill at `skills/aeo-ultimate/SKILL.md`, covering
install, configuration, the FAQ repeater contract, the indexing report, and the
platform limits worth knowing before you promise them.

Copy it into your site so coding agents pick it up:

```bash
cp node_modules/aeoultimate-emdash/skills/aeo-ultimate/SKILL.md    .agents/skills/aeo-ultimate/SKILL.md
```

Then add a line for it under `## Skills` in your `AGENTS.md`. An agent asked to
"add AEO to my EmDash site" can then wire the plugin up without guessing.

---

## License

MIT © Tampa Web Tech
