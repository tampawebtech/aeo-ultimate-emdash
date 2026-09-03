# AEO Ultimate — EmDash CMS Workspace

This repository contains the source code for the **AEO Ultimate** plugin for [EmDash CMS](https://emdashcms.com) and an accompanying test site.

## Directory Structure

* [`plugin/`](./plugin): The standalone EmDash sandboxed plugin (`@aeoultimate/emdash-aeo`).
* [`testsite/`](./testsite): A local Astro + EmDash test site used for development, testing, and live verification.

## Development

```bash
# Build the plugin
cd plugin
npm run typecheck
npm run build

# Run unit and integration tests
node src/social.check.ts
node src/graph.check.ts

# Start the dev server in testsite
cd ../testsite
node start-dev.mjs
```

Admin UI will be available at `http://localhost:4321/_emdash/admin`.
