// Seed football_players for the 4 remaining knockout teams from ESPN's roster
// endpoint. Using ESPN as the source (rather than a hand-typed list) means the
// stored name is the EXACT displayName the scorer feed returns, so goalscorer
// wagers grade on an exact name-set membership check with zero fuzzy matching.
// The ESPN athlete id is used as football_players.id so re-runs upsert cleanly.
//
// Run: node --env-file=.env.local scripts/seed-rosters.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ESPN team id -> our nations.id
const TEAMS = [
  { espnId: 478, nationId: 18, name: "France" },
  { espnId: 164, nationId: 41, name: "Spain" },
  { espnId: 448, nationId: 17, name: "England" },
  { espnId: 202, nationId: 2, name: "Argentina" },
];

// ESPN position abbreviation -> our football_players.position check values.
function mapPosition(abbr) {
  const a = (abbr ?? "").toUpperCase();
  if (a.startsWith("G")) return "gk";
  if (a.startsWith("D")) return "def";
  if (a.startsWith("M")) return "mid";
  if (a.startsWith("F")) return "fwd";
  return "mid"; // unknown -> mid (harmless; picker only cares that they exist)
}

const rosterUrl = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${id}/roster`;

let total = 0;
for (const team of TEAMS) {
  const res = await fetch(rosterUrl(team.espnId));
  if (!res.ok) {
    console.error(`${team.name}: roster fetch failed (${res.status})`);
    process.exit(1);
  }
  const json = await res.json();
  const athletes = json.athletes ?? [];

  const rows = athletes
    .map((a) => {
      const id = parseInt(a.id, 10);
      if (!Number.isFinite(id)) return null;
      return {
        id,
        name: a.displayName,
        nation_id: team.nationId,
        position: mapPosition(a.position?.abbreviation),
        photo_url: a.headshot?.href ?? null,
        current_price: 0.0,
        initial_price: 0.0,
      };
    })
    .filter(Boolean);

  const { error } = await supabase.from("football_players").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error(`${team.name}: upsert failed — ${error.message}`);
    process.exit(1);
  }
  total += rows.length;
  console.log(`${team.name}: seeded ${rows.length} players`);
}

console.log(`\nDone — ${total} players across ${TEAMS.length} teams.`);
