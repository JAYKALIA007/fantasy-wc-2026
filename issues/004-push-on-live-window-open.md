## Parent PRD

`issues/prd.md`

## What to build

Notify players when a **live** checkpoint window opens, so they come back and predict (the refresh-based UI relies on this nudge).

- Fire a push notification via the existing push infrastructure when an `h2`, `et`, or `pens` window opens — e.g. *"⚽ 2nd-half predictions open — France vs England."*
- **No push for `h1`** (it opens with the normal pre-match prediction window).
- Triggered wherever a window transitions to open (admin open in slice 002, and the cron in slice 003).

See PRD sections "Push notifications".

## Acceptance criteria

- [ ] Opening an `h2`/`et`/`pens` window sends one push to subscribed league members with the match + phase.
- [ ] Opening an `h1` window sends no push.
- [ ] A window opening twice (e.g. re-open after admin correction) does not spam duplicate pushes for the same transition.
- [ ] Works whether the window is opened by the admin (slice 002) or the cron (slice 003).

## Blocked by

- Blocked by `issues/001-spine-schema-engine-manual-checkpoint.md`

(Integrates with the cron from `issues/003-espn-cron-automation.md`, but does not require it to merge — manual window-opens trigger the push too.)

## User stories addressed

- User story 11
- User story 12
