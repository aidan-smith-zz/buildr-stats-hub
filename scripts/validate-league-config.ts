/**
 * Run after changing league IDs in src/lib/leagues.ts.
 *   npm run validate-leagues
 */
import { REQUIRED_LEAGUE_IDS, validateRequiredLeaguesConfig } from "../src/lib/leagues";

const { errors, warnings } = validateRequiredLeaguesConfig();

for (const w of warnings) {
  console.warn("[validate-leagues]", w);
}

if (errors.length > 0) {
  console.error("\nLeague config errors (fix before deploy):\n");
  for (const e of errors) console.error("  •", e);
  console.error(
    "\nSee docs/ADD_NEW_LEAGUE.md — every id in BASE_REQUIRED_LEAGUE_IDS needs LEAGUE_DISPLAY_NAMES.\n",
  );
  process.exit(1);
}

console.log("League config OK (" + REQUIRED_LEAGUE_IDS.length + " required leagues).");
