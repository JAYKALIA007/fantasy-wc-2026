## Parent PRD

`issues/prd.md`

## What to build

The end-to-end spine of the live-checkpoint mechanic, proven with a single phase (`h1`) driven entirely by the admin. This slice cuts through every layer once so the rest can layer on top.

- **Schema:** the two round-agnostic tables described in the PRD (Schema changes) — a phase-state table (one row per match × phase: phase, status, actual home/away, open/close timestamps) and a live-predictions table (league, user, match, phase, predicted home/away, points; unique per user×match×phase). Apply via the project's `db query --linked` path (NOT `db push`), then reload PostgREST. RLS per existing per-table conventions (public read; user manages own live predictions; service-role/admin manages phase state).
- **Scoring engine:** the pure `scoreLivePrediction(pred, actual) → points` deep module (exact = +2, else 0), with co-located Vitest tests.
- **API:** a player can submit/update a checkpoint pick for an OPEN phase, and read the open phase + their own pick.
- **Player UI:** on the `/predict` knockout match card, show the currently-open phase as two score inputs + submit.
- **Admin:** a way to set a phase's actual score and mark it scored ("save & score"), which runs the engine over that phase's predictions; and to open the `h1` window.
- **Leaderboard:** a new "Live predictions" component summed into the leaderboard total, plus a distinct line in the profile points breakdown.

Scope to `h1` only here; the full phase lifecycle comes in slice 002. See PRD sections "Checkpoint semantics", "Scoring", "Leaderboard & breakdown", "Player UI", "Deep modules".

## Acceptance criteria

- [ ] Migration creates both tables with correct constraints + RLS, applied to the linked project (not via `db push`), schema reloaded.
- [ ] Pure scoring engine returns +2 only on exact match, 0 otherwise; unit tests cover exact, mismatch, and zero-score cases.
- [ ] An admin can open the `h1` window for an RO32 match.
- [ ] A player can submit and later change their `h1` pick while the window is open via the predictions page.
- [ ] An admin can enter the actual `h1` score and trigger scoring; exact predictors receive +2.
- [ ] The +2 appears in the player's total on `/ranks` and as a distinct "Live predictions" line in the profile breakdown.
- [ ] Group-stage and existing prediction/nation/progression scores are completely unaffected.

## Blocked by

None - can start immediately.

## User stories addressed

- User story 1
- User story 6
- User story 7
- User story 8
- User story 15
- User story 16
- User story 17
- User story 26
- User story 27
