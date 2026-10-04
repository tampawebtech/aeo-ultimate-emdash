---
name: aeo-ultimate
description: Install, configure and troubleshoot the AEO Ultimate plugin on an EmDash site - connected Schema.org entity graph, Open Graph and Twitter cards, FAQ and Service schema, and an indexing report. Use this skill when asked to add SEO, AEO, structured data, schema.org, JSON-LD or answer-engine optimization to an EmDash site, or when FAQ, Service, Organization or Article schema is missing from rendered pages.
---

# AEO Ultimate for EmDash

Publishes one connected Schema.org `@graph` per page, plus Open Graph and
Twitter metadata, from data the site owner has explicitly entered. It is a
standard (sandboxed) marketplace plugin.

**It never infers schema from prose.** Every claim it publishes traces to a
field someone filled in. If a page is missing FAQ or Service schema, the cause
is almost always missing configuration, not a bug - work through
[Troubleshooting](#troubleshooting) before changing code.

## Install

```bash
pnpm add aeoultimate-emdash
```

Register it in `astro.config.mjs`, inside the `emdash()` integration:

```js
import aeoUltimate from "aeoultimate-emdash";

emdash({
  database: sqlite({ url: "file:./data.db" }),
  plugins: [aeoUltimate],
});
```

Restart the dev server. Plugin registration is read at build time, so a running
server will not pick up a newly added plugin.

### The theme must render `<EmDashHead>`

Contributions only appear if the layout includes it:

```astro
<head>
  <EmDashHead page={pageCtx} />
</head>
```

All stock EmDash templates already do. A hand-built theme that omits it will
render **no** plugin metadata, with no error anywhere.

## Configure

Everything is set on **Admin > Plugins > AEO Settings**
(`/_emdash/admin/plugins/aeo-ultimate/settings`). Do not write plugin settings
directly into the database; they live in plugin KV and the form is the
supported path.

Set at minimum the organization name and type. Leave a field blank to fall back
to its default (site title for the name, `Organization` for the type).

List fields are one entry per line. Services are pipe-separated, and only the
first two columns are required:

```
/pages/ac-repair | Air Conditioning Repair | HVAC repair | Tampa, FL | Same-day diagnosis
```

A malformed row is reported in the save toast and **skipped** - it is not
published. If a service is missing from a page, re-read that toast first.

## Emitting FAQ schema

`FAQPage` comes from a **repeater field** the site owner fills in, because a
sandboxed plugin cannot register Portable Text block types (those are
trusted-only). There is no heading-sniffing fallback by design: guessed FAQ
markup misrepresents the page to search and answer engines.

Add the field to the collection in `seed/seed.json`:

```json
{
  "slug": "faq",
  "label": "FAQ",
  "type": "repeater",
  "validation": {
    "subFields": [
      { "slug": "question", "type": "string", "label": "Question" },
      { "slug": "answer", "type": "text", "label": "Answer" }
    ]
  }
}
```

Apply it without wiping content:

```bash
emdash seed seed/seed.json --on-conflict=update
```

Field and sub-field names are configurable in settings; the defaults are
`faq`/`faqs`/`questions` with `question`/`answer`. A row missing either half is
skipped, since an FAQ entry with no answer is invalid markup.

## The Indexing report

`/_emdash/admin/plugins/aeo-ultimate/indexing` lists pages hidden from search
engines, and — just as important — names what it could **not** check.

A collection with SEO disabled (`has_seo = 0`) returns entries whose `seo` is
`undefined`, so those pages have no "Hide from search engines" control at all
and cannot be judged. The report says so rather than reporting them as clean.
Enable SEO per collection under **Admin > Content Types > `<slug>`**.

Plugins cannot enumerate collections, so the report reads a configured list
(default `posts, pages`). Anything not on that list was not examined.

## Limits

Do not promise these; none of them are available to a sandboxed plugin:

- **No author profiles from bylines.** Bylines are the correct home for E-E-A-T
  data, but they are not exposed to the plugin API at all — `ContentItem` has no
  bylines field. Author data must come from settings or from a theme that
  populates `articleMeta`. Verified still true on EmDash 0.38.
- **Cannot serve `/llms.txt` or `/robots.txt`.** Plugin routes are namespaced
  under `/_emdash/api/plugins/<id>/<route>` and always return
  `application/json`. These files are the site owner's to add.
- **Cannot inject raw HTML or scripts.** `page:fragments` is trusted-only. All
  output goes through typed `page:metadata` contributions.
- **No outbound network calls.** `allowedHosts` is empty and stays that way.

## Troubleshooting

**No plugin metadata on any page.** The theme is missing `<EmDashHead>`, or the
server was not restarted after registering the plugin.

**Duplicate JSON-LD blocks.** Something else is emitting a second graph. This
plugin contributes under the dedupe id `"primary"`, which replaces EmDash's own
baseline rather than adding to it - core emits a disconnected `BlogPosting` or
`WebSite` under that same id, and plugin contributions are composed first with
first-wins dedup. Two blocks means a *different* source, usually a theme
component emitting its own `<script type="application/ld+json">`.

**FAQ missing.** No repeater rows on that entry, rows missing a question or an
answer, or a field name that does not match settings.

**Service missing.** The path in settings must match the page path exactly and
start with `/`. Check the save toast for skipped rows.

**Indexing report shows nothing hidden.** Confirm it is not a blind spot: if the
collection appears in an alert banner, SEO is off for it and nothing there could
be checked.
