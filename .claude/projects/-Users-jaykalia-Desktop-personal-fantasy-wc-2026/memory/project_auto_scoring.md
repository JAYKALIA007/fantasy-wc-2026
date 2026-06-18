---
name: Auto-scoring setup
description: How auto-scoring is implemented — edge function, cron, ESPN API
type: project
---

Auto-scoring is live. Matches are scored automatically 2h15m after kickoff.

**Why:** Avoid manual admin effort for every match result.

**How to apply:** When touching match scoring or admin flow, be aware scores may already be filled in by the cron.

## Components
- `supabase/functions/auto-score-matches/index.ts` — Deno edge function, fetches ESPN unofficial API by team name + date, runs same scoring RPCs as admin API
- `supabase/migrations/015_auto_score.sql` — adds `auto_fetched boolean` column to matches
- `supabase/migrations/016_cron_auto_score.sql` — pg_cron job every 15 min calling the edge function
- Admin panel shows amber banner on auto-fetched matches: "Auto-fetched from ESPN. If incorrect, edit manually."

## ESPN name mapping
Some nations need mapping: Türkiye→Turkey, Ivory Coast→Côte d'Ivoire, Congo DR→DR Congo, Bosnia-Herzegovina→Bosnia and Herzegovina, United States→USA

## Infra notes
- Supabase free tier, ~3k invocations/month (well within 500k limit)
- `SUPABASE_SERVICE_ROLE_KEY` is auto-injected into edge functions — do not try to set it as a secret (blocked by Supabase)
- DB password: reset on 2026-06-15 (user knows it)
