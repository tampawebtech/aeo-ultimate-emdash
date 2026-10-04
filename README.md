# AEO Ultimate — EmDash CMS Workspace

This repository contains the source code for the **AEO Ultimate** plugin for [EmDash CMS](https://emdashcms.com) and an accompanying test site.

## Install

```bash
npm install aeoultimate-emdash
```

Register it inside the `emdash()` integration in `astro.config.mjs`, then restart the dev server:

```js
import emdash from "emdash/astro";
import aeoUltimate from "aeoultimate-emdash";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [aeoUltimate],
    }),
  ],
});
```

Your theme's layout must render `<EmDashHead>` (all stock EmDash templates do). Configure the plugin at **Admin › Plugins › AEO Settings**.

* Full plugin README: [`plugin/README.md`](./plugin/README.md)
* Documentation: [aeoultimate.com/docs/emdash](https://aeoultimate.com/docs/emdash/)
* npm: [aeoultimate-emdash](https://www.npmjs.com/package/aeoultimate-emdash)

## Directory Structure

* [`plugin/`](./plugin): The standalone EmDash sandboxed plugin (`aeoultimate-emdash`).
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
