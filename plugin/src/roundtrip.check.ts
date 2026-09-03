// Loads the REAL stored settings, renders them into the form, simulates a
// Save with no edits, and diffs. Anything lost here would be silently lost
// the first time the merchant opens settings and clicks Save.
import { DatabaseSync } from "node:sqlite";
import { buildSettingsBlocks, formValuesToSettings } from "./settingsForm.ts";

const db = new DatabaseSync("C:/Users/jades/Desktop/aeo ultimate emdash/testsite/data.db");
const row: any = db.prepare("select value from options where name = ?").get("plugin:aeo-ultimate:settings");
const stored = JSON.parse(row.value);

const blocks = buildSettingsBlocks(stored).blocks as any[];
const form = blocks.find((b) => b.type === "form");
const values: Record<string, unknown> = {};
for (const f of form.fields) values[f.action_id] = f.initial_value;

const { settings: after, warnings } = formValuesToSettings(values);

const a = JSON.stringify(stored, Object.keys(stored).sort());
const b = JSON.stringify(after, Object.keys(after).sort());
console.log("services in:", stored.services.length, "-> out:", after.services?.length ?? 0);
console.log("sameAs in:", stored.org.sameAs.length, "-> out:", after.org?.sameAs?.length ?? 0);
console.log("warnings:", warnings.length ? warnings : "(none)");
console.log("IDENTICAL:", JSON.stringify(stored) === JSON.stringify(after));
if (JSON.stringify(stored) !== JSON.stringify(after)) {
  console.log("\nBEFORE:", JSON.stringify(stored, null, 1).slice(0, 700));
  console.log("\nAFTER :", JSON.stringify(after, null, 1).slice(0, 700));
}
