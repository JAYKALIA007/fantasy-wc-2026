## Parent PRD

`issues/prd.md`

## What to build

Make the windows and scores move **automatically off ESPN**, so the admin no longer has to drive each match by hand (manual override from slice 002 stays as the fallback).

- **ESPN phase-mapper:** the pure deep module mapping an ESPN event status payload → `{ phase, boundaryScore, isComplete }`, encapsulating all ESPN status/period/clock interpretation, with captured-payload fixture tests (pre-match, 1st half, half-time, 2nd half, end-of-90' level vs decided, extra time, shootout, completed).
- **Cron integration:** extend the existing auto-score cron to, for each live knockout match, run phase-mapper → state machine (slice 002) → open/close windows, snapshot boundary scores, and score. Increase cadence to ~2 min during match hours (`pg_cron`). Fetch each unique match-date from ESPN once per run and reuse across matches (dedupe).
- **Team-name fixes** (from PRD "ESPN team-name fixes"): `Congo DR`↔`DR Congo` (correct the reversed map), `Cape Verde`↔`Cabo Verde` (add), `Bosnia-Herzegovina`↔`Bosnia and Herzegovina` (fix hyphen/" and " match).

See PRD sections "Window driver", "Deep modules", "ESPN team-name fixes", "Further Notes".

## Acceptance criteria

- [ ] ESPN phase-mapper has fixture-based unit tests for each match phase and the completed/decided states.
- [ ] The cron auto-opens/closes windows and snapshots boundary scores for live knockout matches without admin action.
- [ ] Cron fetches each unique date once per run (verified by call count / code), not once per match.
- [ ] The three team-name mismatches resolve correctly against the ESPN feed.
- [ ] Admin manual override still works and takes precedence when used (re-scoring remains idempotent).
- [ ] Cadence is ~2 min during match hours.

## Blocked by

- Blocked by `issues/002-all-phases-lifecycle-privacy-recap.md`

## Validation note

ET and penalty-shootout detection from ESPN is best-effort and must be confirmed against the first live match (compare ESPN-driven values to admin manual entry) before being fully trusted. Safe to merge ahead of that because the admin override backstops it.

## User stories addressed

- User story 19
- User story 24
- User story 25
