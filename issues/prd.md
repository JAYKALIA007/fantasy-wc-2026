# PRD — Live In-Play Checkpoint Predictions (Knockouts)

## Problem Statement

The group stage is over and the leaderboard has largely settled. With only one prediction per match (the pre-kickoff full-time scoreline) and the nation/progression bonuses, a player who fell behind during the group stage has almost no way to catch the leader over the knockout rounds. The owner wants a high-variance, engagement-driving mechanic for the knockouts that rewards watching matches live and gives trailing players a genuine path to close the gap — without the owner having to babysit every match (he can't watch all 16 RO32 games, many of which kick off after midnight IST).

## Solution

For each knockout match, in addition to the existing pre-match full-time prediction, players get **four extra "checkpoint" predictions** of the exact running scoreline at successive stages of the match:

- **h1** — score at half-time (45')
- **h2** — score at full-time / 90'
- **et** — score after extra time (120') — only if the match goes to ET
- **pens** — the penalty shootout tally (e.g. 4-3) — only if the match goes to penalties

Each checkpoint is **exact-only** and worth **+2 points**. A single match can therefore yield up to ~8 extra points (plus the existing +3), making it a real comeback lever.

Each checkpoint has its own window that opens and closes around the relevant phase of the match, so picks are made **before** that phase's football is played (you predict the 90' score during the first half, etc.). Windows are driven automatically off the ESPN live feed (the same source the app already uses to auto-score), with a full manual admin override as the safety net. Players make their picks inline on the existing predictions page; a push notification fires when each live window opens.

The mechanic is built round-agnostic so it can be switched on for RO16 → Final later with minimal activation work.

## User Stories

1. As a trailing player, I want extra exact-score predictions during each knockout match, so that I have a realistic way to catch up to the leader.
2. As a player, I want to predict the half-time score of a match before kickoff, so that I can earn points for reading the game.
3. As a player watching the first half, I want to predict the 90' score before the second half starts, so that I'm rewarded for live judgement.
4. As a player, I want to predict the extra-time score before ET begins, so that close matches give me another scoring chance.
5. As a player, I want to predict the penalty shootout tally before the shootout starts, so that I can gamble on a hard-to-hit, high-reward outcome.
6. As a player, I want each checkpoint to be worth +2 only when I get the exact scoreline, so that the mechanic stays high-skill / high-variance.
7. As a player, I want to make these picks inline on the predictions page where I already predict matches, so that I don't have to learn a new screen.
8. As a player, I want to see only the currently-open checkpoint for a match, so that the interface isn't cluttered with windows I can't act on.
9. As a player, I want a recap of already-resolved checkpoints (the actual score, my pick, and points earned), so that I can see how I did.
10. As a player, I want to be able to change my checkpoint pick until its window closes, so that I can react to the run of play.
11. As a player, I want a push notification when a live checkpoint window opens, so that I don't miss my chance to predict.
12. As a player, I do NOT want a separate push for the half-time (h1) window, so that I'm not spammed for the pre-match guess.
13. As a player, I want my checkpoint picks to be hidden from other players until the window closes, so that nobody can copy the leader at the last second.
14. As a player, I want to see everyone's checkpoint picks after the window closes, so that the reveal is part of the fun.
15. As a player, I want my live-checkpoint points shown as their own line in my points breakdown, so that I can see where my comeback points came from.
16. As a player, I want the leaderboard total to include my live points automatically, so that standings reflect the full game.
17. As a player who didn't predict a checkpoint, I want to simply earn 0 for it with no penalty, so that missing a window costs nothing beyond the foregone upside.
18. As a player, I want checkpoints that never happen (ET/pens in a match decided in 90') to simply not exist, so that I'm never scored on a phase that didn't occur.
19. As the admin, I want the windows to open/close and the scores to fill in automatically from ESPN, so that I don't have to watch every match.
20. As the admin, I want to manually open or close any checkpoint window, so that I can correct the rare case where ESPN's phase detection is wrong.
21. As the admin, I want to manually enter or correct the actual score for any checkpoint, so that I can fix bad ESPN data — especially penalty shootouts, which ESPN reports unreliably.
22. As the admin, I want re-entering a corrected score to re-score that checkpoint cleanly, so that there's never double-counting or stale points.
23. As the admin, I want a per-phase view of each knockout match (status + actual score + open/close), so that I can see and control the live state at a glance.
24. As the owner, I want the ESPN-driven values and my manual entries to be comparable on the first night, so that I can confirm the phase mapping is trustworthy before relying on it.
25. As the owner, I want the whole mechanic to carry forward to RO16 → Final with minimal work, so that I build it once and reuse it.
26. As a player, I want the existing pre-match full-time prediction (+3 exact / +1 result) to keep working unchanged, so that the new mechanic adds to rather than replaces the current game.
27. As the owner, I want group-stage scores and standings to remain completely untouched, so that adding this feature can't rewrite history.

## Implementation Decisions

### Checkpoint semantics
- Checkpoints predict the **cumulative running scoreline** at each stage (what's on the broadcast scoreboard), not goals-within-a-phase.
- `h2` (90' score) deliberately overlaps with the existing pre-match full-time prediction's target — they are different windows with different information and point values, and that overlap is intentional.
- `pens` is the exact **shootout tally** (e.g. 4-3), not aggregate or sudden-death rounds.

### Window lifecycle
- `h1` opens immediately (with the existing pre-match prediction window) and closes at **kickoff**. It is effectively a pre-match blind guess of the half-time score.
- `h2` opens at kickoff, closes when the **2nd half starts**.
- `et` opens at the end of 90' **only if the match is level** (going to ET), closes when **ET starts**.
- `pens` opens at the end of ET **only if still level**, closes when the **shootout starts**.
- Windows close conservatively (at the start of the next phase, never mid-phase) so a player can never predict a score after seeing that phase's goals.
- `et`/`pens` windows are created lazily — if a match is decided earlier, they never exist and "void if not reached" is automatic.

### Window driver
- The **existing ESPN auto-score cron is the primary driver**: extended to detect each live knockout match's phase (from ESPN status/period/clock), open/close windows accordingly, and snapshot the boundary score at each transition.
- Cron cadence increased to roughly every **~2 minutes during match hours** (free `pg_cron`), so a window can't linger more than ~2 minutes into the next phase.
- The cron fetches each unique match-date from ESPN **once per run** and reuses it across matches (dedupe), to minimise calls to the undocumented ESPN endpoint.
- **Full admin manual override** on every window and every actual score is the fallback for incorrect/missing ESPN data, especially penalties.

### Scoring
- A checkpoint is scored the moment its **window is closed AND its actual boundary score is set** (cron does close → snapshot → score in one pass; manual entry triggers the same).
- Exact match → **+2**, otherwise **0**. Points stored **per prediction row**.
- Re-scoring is **idempotent**: recomputing a checkpoint recomputes points for every prediction in that (match, phase), so admin corrections self-heal with no double-counting.

### Privacy
- A player's checkpoint picks are **hidden from others until the window closes**, then revealed (mirrors how normal predictions are gated).

### Leaderboard & breakdown
- Live-checkpoint points are a **separate scoring component** (not folded into prediction points): a new field summed into the leaderboard total, and a distinct "Live predictions" line in the profile points breakdown.

### Player UI
- Lives **inline on the existing predictions page**, inside each knockout match's card.
- Shows **only the currently-open checkpoint** as an input (two score boxes + submit), plus a **recap** of already-resolved checkpoints (actual score, the player's pick, points). A closed-but-unscored phase shows an "awaiting result" state.
- Picks are **editable until the window closes**.
- Surface is **refresh-based** (no live socket); the push notification is the nudge to come back.

### Push notifications
- One push fires when each **live** window (`h2`/`et`/`pens`) opens, via the existing push infrastructure, triggered by the cron.
- **No push for `h1`** (it opens with the normal pre-match window).

### Admin UI
- Each knockout match gets a **per-phase section** (h1/h2/et/pens) showing status (pending/open/closed/scored), a **manual actual-score entry** with "save & score", and an **open/close override** toggle.

### Schema changes
- A **phase-state table** (one row per match × phase): phase, status, actual home/away score, open/close timestamps. Source of truth for window state and boundary results.
- A **live-predictions table**: league, user, match, phase, predicted home/away score, points; unique per (user, match, phase).
- Both round-agnostic (keyed by match/round), so RO16 → Final reuse them. RLS following the existing per-table conventions (public read; user manages own live predictions; service role/admin manages phase state).
- Migration applied via the project's `db query --linked` path (NOT `db push`) per the established migration-history-drift constraint, followed by a PostgREST schema reload.

### Deep modules (extracted for isolation testing)
1. **Live scoring engine** — pure function mapping (prediction, actual score) → points.
2. **ESPN phase-mapper** — pure function mapping an ESPN event status payload → `{ phase, boundaryScore, isComplete }`, encapsulating all the messy ESPN-specific status/period/clock interpretation behind a stable interface.
3. **Phase state machine** — pure function mapping (current stored phase rows, freshly detected phase) → the set of window transitions and boundary-score snapshots to apply.

### Round-agnostic reuse
- Activating a later round requires only: that round's matches exist, opening their `h1` windows, and including the round in the predictions-page filter. The cron and all scoring are already round-agnostic.

### ESPN team-name fixes (folded into cron work)
- `Congo DR` (ESPN) ↔ `DR Congo` (DB) — existing name-map is reversed and must be corrected.
- `Cape Verde` (ESPN) ↔ `Cabo Verde` (DB) — mapping missing.
- `Bosnia-Herzegovina` (ESPN) ↔ `Bosnia and Herzegovina` (DB) — fuzzy match fails on hyphen vs " and ".

## Testing Decisions

- **What makes a good test here:** assert external behavior of the pure modules against fixed inputs/outputs, not implementation details. No DB or network in unit tests; ESPN payloads are tested as captured fixtures.
- **Modules to unit-test:**
  - **Live scoring engine** — exact match → +2; any mismatch → 0; missing prediction → no row/0.
  - **ESPN phase-mapper** — fed representative ESPN payloads (pre-match, 1st half, half-time, 2nd half, end of 90' level vs decided, extra time, shootout, completed), returns the correct phase, boundary score, and completion flag. The penalty/ET payloads are best-effort and explicitly flagged for refinement after the first live night.
  - **Phase state machine** — given a stored phase state and a detected phase, produces the correct open/close transitions and snapshot actions; correctly does NOT open `et`/`pens` when the match was decided earlier; is idempotent (re-running with the same detected phase produces no spurious changes).
- **Prior art:** the existing pure-logic-plus-Vitest pattern in the redraft engine, bracket logic, progression engine, holdings resolver, and leaderboard computation (each with a co-located `.test.ts`).
- The cron handler, API routes, and UI are validated manually (and via the first-night ESPN-vs-manual diff), not unit-tested.

## Out of Scope

- **RO16 → Final activation** — the engine is built round-agnostic, but only RO32 windows are wired tonight.
- **Real-time UI push of window state** (websockets/polling that auto-reveals new windows without a refresh) — refresh + the open-window push notification is the v1 model.
- **The "official knockout match score" decision** (whether the match's stored `home_score`/`away_score` — which the existing +3/+1 prediction and the nation bonus score against — represents the 90' or the 120' score, and how a penalty-decided draw should be treated for the nation bonus). This is a pre-existing, separate product decision and does not block this feature.
- **Auto-detection reliability guarantees for penalties** — pens will frequently be admin-entered; ESPN shootout reporting is treated as unreliable by design.
- **Partial credit / closeness scoring** — checkpoints are exact-only.

## Further Notes

- All 16 RO32 fixtures were verified to exist on the ESPN feed with matching dates, so auto-mode is viable (subject to the three team-name fixes above). The first match (South Africa vs Canada) kicks off 2026-06-28 19:00 UTC = Mon 29 Jun 00:30 IST.
- The first live night is explicitly a **validation run**: ESPN-driven values and the owner's manual entries are compared to confirm the phase mapping (especially ET/penalties) before fully trusting automation.
- The mechanic builds on, and must not disturb, the recently shipped held-team work (redrafted teams drive display + nation-bonus scoring) — it is an additive layer and shares no scoring paths with the nation bonus.
- The build proceeds in independently shippable increments (schema+engine → submit/read API → player UI → cron+gating → admin → leaderboard) so that no half-built state can break tonight's matches.
