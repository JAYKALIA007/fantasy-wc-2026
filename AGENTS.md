<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase reads: the 1000-row cap

Supabase/PostgREST truncates every response at the project's **"Max rows"** API
setting (default **1000**) — silently, with no error. A query that sums or counts
rows across all members × all matches will grow past this mid-tournament and start
dropping rows, under-counting whoever's rows land in the truncated tail. This
already happened once: the leaderboard's finished-predictions read crossed 1000 at
match 87 (Argentina–Cape Verde, RO32) and started under-counting ~16 players until
it was paged.

Rules:

1. **Never lower the Supabase "Max rows" API setting below 1000.** The leaderboard
   pager (`fetchAll` in `lib/server/leaderboard.ts`) uses a page size of 1000; if
   the cap drops under that, paging can stop early and silently under-count again.
2. **Any read that scans a whole table league-wide must page through every row**
   (e.g. a new stats/analytics page that sums a table across all members). Route it
   through a `.range()` pager like `fetchAll`, never a single unbounded fetch.
   Reads scoped to one user or one match (≤ ~100 rows) are safe as-is. As of the
   last audit, `computeLeaderboard` was the only league-wide aggregation, and it is
   now paged.
