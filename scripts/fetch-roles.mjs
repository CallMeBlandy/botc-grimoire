// Downloads Blood on the Clocktower character data + token icons for local use.
//
// The character text is © The Pandemonium Institute. This script fetches it
// straight from the open community dataset onto YOUR machine for personal play;
// nothing is bundled or redistributed by this repo. Run: `npm run fetch-roles`.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const RAW = "https://raw.githubusercontent.com/bra1n/townsquare/develop/src";
const ROLES_URL = `${RAW}/roles.json`;
const ICON_URL = (id) => `${RAW}/assets/icons/${id}.png`;

// The three base editions we support first.
const EDITIONS = new Set(["tb", "bmr", "snv"]);
const TEAMS = new Set(["townsfolk", "outsider", "minion", "demon", "traveler"]);

async function main() {
  console.log("Fetching roles.json …");
  const res = await fetch(ROLES_URL);
  if (!res.ok) throw new Error(`roles.json fetch failed: ${res.status}`);
  const all = await res.json();

  const roles = all
    .filter((r) => EDITIONS.has(r.edition) && TEAMS.has(r.team))
    .map((r) => ({
      id: r.id,
      name: r.name,
      edition: r.edition,
      team: r.team,
      ability: r.ability ?? "",
      firstNight: r.firstNight ?? 0,
      firstNightReminder: r.firstNightReminder ?? "",
      otherNight: r.otherNight ?? 0,
      otherNightReminder: r.otherNightReminder ?? "",
      reminders: r.reminders ?? [],
      remindersGlobal: r.remindersGlobal ?? [],
      setup: r.setup ?? false,
    }));

  console.log(`Kept ${roles.length} characters across ${EDITIONS.size} editions.`);

  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(
    path.join(root, "data", "roles.json"),
    JSON.stringify(roles, null, 2),
  );
  console.log("Wrote data/roles.json");

  // Download token icons for offline play.
  const iconDir = path.join(root, "public", "icons");
  await mkdir(iconDir, { recursive: true });
  let ok = 0;
  const missing = [];
  await Promise.all(
    roles.map(async (r) => {
      const out = path.join(iconDir, `${r.id}.png`);
      if (existsSync(out)) {
        ok++;
        return;
      }
      try {
        const ir = await fetch(ICON_URL(r.id));
        if (!ir.ok) {
          missing.push(r.id);
          return;
        }
        const buf = Buffer.from(await ir.arrayBuffer());
        await writeFile(out, buf);
        ok++;
      } catch {
        missing.push(r.id);
      }
    }),
  );
  console.log(`Downloaded ${ok} icons; ${missing.length} missing.`);
  if (missing.length) {
    console.log("  (UI falls back to a text token for these:", missing.join(", "), ")");
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nfetch-roles failed:", err.message);
  console.error("Check your internet connection and try again.");
  process.exit(1);
});
