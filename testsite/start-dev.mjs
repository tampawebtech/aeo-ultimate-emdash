process.env.ASTRO_DEV_BACKGROUND = "1";
import { cli } from "./node_modules/astro/dist/cli/index.js";

await cli([process.execPath, "astro", "dev"]);
