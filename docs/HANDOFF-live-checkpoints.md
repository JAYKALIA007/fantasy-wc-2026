# Handoff — Live In-Play Checkpoint Predictions (RO32+)

_Last updated: 2026-06-28 evening IST, just before RO32 kickoff. Branch `main`, HEAD `913ce7f`, everything committed & pushed, Vercel auto-deploys `main`._

## TL;DR

A new knockout-only mechanic shipped end-to-end and is **live in production**: for each knockout match, players get up to four extra "checkpoint" predictions of the exact running scoreline — **h1** (half-time), **h2** (90'), **et** (120'), **pens** (shootout tally). Each is **exact-only, +2 pts**. Windows open/close around each phase, driven automatically off the ESPN feed (the cron), with full admin manual override. Built **round-agnostic** so RO16→Final reuse it.

Also done this session: redraft window close time moved to **00:00 IST 29 Jun** (midnight, 30 min before first RO32 match).

The full spec is in `issues/prd.md`; the four build slices are `issues/001`–`004`. All four are implemented.

## Tournament timing (so you know what's "live")

- First RO32 match: **South Africa vs Canada, 2026-06-28 19:00 UTC = Mon 29 Jun 00:30 IST** (match id 73).
- All 16 RO32 fixtures (match ids 73–88) exist in the DB and on the ESPN feed with matching names/dates (verified).
- RO32 runs 29 Jun → 5 Jul IST.

## What's deployed right now

| Piece | State |
|---|---|
| DB tables `match_checkpoint_phases`, `live_checkpoint_predictions` (+RLS) | Applied to linked prod via migration `027` |
| Edge function `auto-score-matches` (now also runs the live-checkpoint pass) | **Deployed** to project `ihwsprtjkpvujjxsedcz` |
| `pg_cron` job 2 (`auto-score-matches`) | Cadence **every 2 min** (was 5; migration `028`) |
| App code (player UI, admin UI, API routes, leaderboard) | Pushed to `main` → Vercel |
| Redraft window `closes_at` | Updated in prod to `2026-06-28 18:30:00+00` (= 00:00 IST 29 Jun) |

## How the mechanic works

### Window lifecycle (per `issues/prd.md` "Window lifecycle")
- **h1** — predicts HT score. Opens pre-match, closes at kickoff, boundary captured at the HT break.
- **h2** — predicts 90' score. Opens at kickoff, closes at 2nd-half start, boundary at full-time / ET start.
- **et** — predicts 120' score. Opens at end of 90' **only if level**, closes at ET start.
- **pens** — predicts the shootout tally. Opens at end of ET **only if level**, closes at shootout start.
- Checkpoint scored the moment its window is **closed AND** its actual boundary score is set. Exact → +2, else 0. Re-scoring is idempotent.

### Automation vs manual (IMPORTANT operational nuance)
- **h1 + h2 are fully automatic** via the cron. For a match decided in 90' (the common case) you do **nothing** — cron opens h1 ~3h before kickoff, closes it at kickoff, opens h2, snapshots the HT score at half-time, snapshots the 90' score at full-time, and scores all predictions.
- **et / pens OPENING is admin-driven by design.** The state machine never auto-_opens_ et/pens — ESPN's "going to extra time / going to penalties" instant is too brief/unreliable to gate on. For a match still level after 90', the admin taps **Open** on `et` (then later `pens`) in the admin Match Results card. The cron still **closes and scores** et/pens automatically once the match reaches ET/shootout/complete. This matches the PRD's "ET/pens are best-effort, admin-verified on the first night."
- **Full admin override** exists for everything: open/close any phase, enter/correct any actual score and re-score (`/api/admin/checkpoint-phase`).

### Privacy
A player's pick for a phase is hidden from other players until that phase's window closes — enforced by RLS on `live_checkpoint_predictions` (own picks always readable; others' only when the phase row is `closed`/`scored`).

### Scoring surface
`live_checkpoint_points` is a separate component summed into `total_points` in `lib/server/leaderboard.ts`, and shows as a distinct "Live predictions" line in the profile breakdown.

## Key files

### Pure, Vitest-tested deep modules (the canonical logic)
- `lib/server/liveCheckpoint.ts` (+`.test.ts`) — `scoreLiveCheckpoint(pred, actual) → +2|0`.
- `lib/server/espnPhase.ts` (+`.test.ts`) — `mapEspnCompetition(espnComp) → {stage, home, away, shootout, decidedInRegulation}`. Stages: `pre | first_half | halftime | second_half | extra_time | shootout | complete`.
- `lib/server/checkpointPhases.ts` (+`.test.ts`) — `computePhaseTransitions(storedPhases, detected) → PhaseAction[]` (idempotent open/close/snapshot; lazy et/pens; sweeps open windows at full-time).
- Total checkpoint tests: 30 (7 scoring + 11 mapper + 12 state machine). Whole suite: **70 tests green**. Run: `npx vitest run`.

### Cron (Deno edge function)
- `supabase/functions/auto-score-matches/index.ts` — two passes:
  1. **Final-score pass** (pre-existing behaviour, untouched logic): scores finished matches + nation bonus, never re-touches `status='finished'`.
  2. **Live-checkpoint pass** (new): selects knockout matches with kickoff in `[now−4h, now+3h]`, maps ESPN → state machine → applies transitions → scores predictions → queues pushes.
  - Per-date ESPN fetch cache (`getEvents`) dedupes calls across both passes.
  - ⚠️ **The pure logic (mapper, state machine, scorer) is DUPLICATED inline here** because this is Deno and can't import/Vitest the `lib/server` modules. If you change `espnPhase.ts` / `checkpointPhases.ts` / `liveCheckpoint.ts`, mirror the change in this file. They are commented as such.

### API routes
- `app/api/checkpoint-picks/route.ts` — player `POST` (submit/update pick for an open phase) and `GET ?match_id=` (open phase + own picks + recap).
- `app/api/admin/checkpoint-phase/route.ts` — admin `POST {match_id, phase, action: open|close|score, actual_home?, actual_away?}`. Fires the window-open push (h2/et/pens only) on a genuine open transition.

### UI
- `app/(app)/predict/page.tsx` + `predict-client.tsx` — `CheckpointSection` inside each knockout card: open-phase input (+2 badge) + recap of resolved phases (pick vs actual vs points). **Visibility fix**: knockout matches with an OPEN phase stay listed on `/predict` even after kickoff.
- `app/(app)/admin/admin-client.tsx` — per-phase "Live Checkpoints" block on RO32 Match Results cards (Open/Close + Save&Score). Shows once a phase row exists (cron opens h1 ~3h pre-kickoff) and hides when the match is finished.

## Tonight's runbook (RO32)

1. **Before kickoff**: nothing required. ~3h before each match the cron opens h1; players see the HT-score input on `/predict`. (You can also open h1 early from admin once the row appears.)
2. **During a match decided in 90'**: nothing required. h1 scores at HT, h2 scores at FT, automatically.
3. **If a match is level after 90' (going to ET)**: open `et` in admin (and later `pens` if it goes to a shootout). Cron closes/scores them.
4. **Validation (the point of night one)**: after each match, compare what the cron auto-filled (phase actual scores + points) against the real result, especially any ET/pens match. Penalty shootout tally from ESPN is the least trusted field — verify and correct via admin Save&Score if wrong (re-scoring is idempotent).

## Deferred / not done (future work)

- **et/pens auto-open**: currently admin-driven. After observing real ET/shootout ESPN payloads tonight, you can teach `mapEspnCompetition` to detect the end-of-regulation/end-of-ET "level" instant and have the state machine auto-open et/pens. Flagged best-effort in the PRD.
- **RO16→Final activation**: the engine is already round-agnostic (`KNOCKOUT_ROUND_IDS` in the edge function lists all knockout rounds; cron/scoring/UI are round-keyed). To turn a later round on you only need its matches to exist; h1 windows auto-open via cron, et/pens admin-opened as above. No code change expected — verify on first RO16 match.
- **Admin advancer UI for RO16+/QF/SF/Final**: the "who advanced" selector currently wired for RO32 only (pre-existing, from earlier work).
- **RO16+ re-draft window UI**: build before RO16.
- **KO nation bonus for penalty-decided matches** (draw pays both +1): open product decision, pre-existing, out of scope here.
- **Migration 016 service_role JWT committed in plaintext**: pre-existing security cleanup item.

## Hard constraints (do not violate)

- **Migration drift**: migrations 012–028 were applied **manually** and are NOT in Supabase's migration history. **NEVER run `supabase db push`.** Apply SQL with `npx supabase db query --linked -f <file.sql>` then reload PostgREST (`NOTIFY pgrst, 'reload schema';` via the same path). Local CLI is v2.106; `--execute` flag doesn't exist, only `-f`.
- **`SUPABASE_SERVICE_ROLE_KEY`** lives in `.env.local` only — never commit or paste it into chat/docs.
- **ESPN names**: verified to match our DB names exactly for all current teams incl. Congo DR, Bosnia-Herzegovina, Cape Verde. `ESPN_NAME_MAP` is intentionally **empty** — the old `"Congo DR"→"DR Congo"` entry was a bug (would break match id 80 England–Congo DR). Don't re-add overrides without verifying against the live feed.
- **Group-stage scores are frozen**: the cron only processes `status != 'finished'`, and holdings/scoring are round-keyed, so adding this feature cannot rewrite history. Keep it that way.
- **Read `node_modules/next/dist/docs/` before writing Next.js code** (per `AGENTS.md` — this Next.js has breaking changes vs training data).

## Useful commands

```bash
npx vitest run                                              # 70 tests
npx tsc --noEmit                                            # type check
npx next build                                              # prod build
npx supabase functions deploy auto-score-matches           # redeploy cron
npx supabase db query --linked -f <file.sql>               # apply SQL (NOT db push)
# Manually invoke the cron (service key from .env.local; never print it):
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-) && \
curl -s -X POST "https://ihwsprtjkpvujjxsedcz.supabase.co/functions/v1/auto-score-matches" \
  -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" | python3 -m json.tool
```

Cron response shape: `{ "final": [...], "checkpoints": [...], "pushes": N }`.

## Commits this session (on `main`)
- `4a9c177` feat(checkpoint): spine — schema + engine + manual h1 (issue 001)
- `44cf86d` feat(checkpoint): full lifecycle + ESPN automation (issues 002–004)
- `913ce7f` fix(admin): show checkpoint controls once phases exist (pre-kickoff)
- Redraft `closes_at` and cron cadence were applied directly to prod (cadence also recorded as migration `028`).
