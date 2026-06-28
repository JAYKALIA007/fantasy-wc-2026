## Parent PRD

`issues/prd.md`

## What to build

Extend the spine (slice 001) from a single manual `h1` to the **full four-phase mechanic** with its window lifecycle, privacy, and recap — still admin-driven (cron automation comes in slice 003).

- **Phase state machine:** the pure deep module mapping (stored phase rows, a target/detected phase) → the open/close transitions and boundary-score snapshots to apply, with co-located tests. Enforces the lifecycle from the PRD ("Window lifecycle"): `h1`→kickoff, `h2`→2nd-half start, `et`→ET start, `pens`→shootout start; `et`/`pens` open **only if the match is still level** (lazy — never created otherwise); `pens` is the exact shootout tally.
- **Admin:** per-phase rows on each knockout match showing status (pending/open/closed/scored) with open/close override and the manual actual-entry from slice 001, for all four phases.
- **Privacy:** a player's picks for a phase are hidden from other players until that window closes, then revealed.
- **Player UI:** show only the currently-open phase as input, plus a **recap** of already-resolved phases (actual score, the player's pick, points earned); a closed-but-unscored phase shows an "awaiting result" state.

See PRD sections "Window lifecycle", "Privacy", "Player UI", "Admin UI", "Deep modules".

## Acceptance criteria

- [ ] Phase state-machine module has unit tests covering: each lifecycle transition, `et`/`pens` NOT opening when the match was decided earlier, and idempotency (re-applying the same detected phase produces no spurious changes).
- [ ] Admin can open/close and score any of the four phases per RO32 match; et/pens only become available once the match reaches them.
- [ ] `pens` is entered/scored as the exact shootout tally (e.g. 4-3).
- [ ] A player sees only the open phase to predict, plus a recap of resolved phases with their pick and points.
- [ ] Other players cannot see a player's pick for an open window; picks are revealed after the window closes.
- [ ] A match decided in 90' never exposes et/pens windows, and no points are awarded for them.

## Blocked by

- Blocked by `issues/001-spine-schema-engine-manual-checkpoint.md`

## User stories addressed

- User story 2
- User story 3
- User story 4
- User story 5
- User story 9
- User story 10
- User story 13
- User story 14
- User story 18
- User story 20
- User story 21
- User story 22
- User story 23
