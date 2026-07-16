# Knockout-Stage Team Reassignment — Spec

**Status:** Design locked (grilled 2026-06-21, updated 2026-06-28). Not yet implemented.
**Context:** Group stage ends ~2026-06-30. This must ship before then.

---

## Problem

Players pick a **primary** nation (1× bonus) and a **secondary/wildcard** nation
(2× bonus) at onboarding, and are stuck with them all tournament. When a team is
knocked out, the player is left with a dead pick that can never score again.
We want to let players reassign teams as the bracket narrows, with costs that
keep the decision meaningful.

WC2026 ladder: **48 → Group → RO32 (32) → RO16 (16) → QF (8) → SF (4) → Final (2).**
League size: **~19 players and growing.**

---

## The model (one line)

You carry teams through the knockouts. At each round boundary the board opens —
you may **swap** (paying an escalating penalty) or **keep** (free). Two teams
collapse into one at the RO32→RO16 line.

---

## Locked rules

### 1. Swaps are optional and player-initiated
- **Keeping is always free** — even a dead team (it just earns nothing more).
- **Any change is penalized**, whether the old team is alive or dead. The penalty
  is the price of a fresh team, full stop. There are no free replacements.
- This creates the core decision every round: *eat the penalty for a live team
  that can still earn, or keep my (possibly dead) team for free and bank nothing?*

### 2. No exclusivity — shareable everywhere
Any player may hold any surviving team; multiple players can share a team.
Rationale: at 19 players (and growing) exclusivity is **mathematically
impossible** from RO16 on (16 teams < 19 players) and breaks entirely by the QF
(8 teams). The penalty is the only gate. Dark-horse variety is encouraged through
*scoring* (the 2× secondary multiplier), not through locking teams.

### 3. Swap-penalty ladder

| Board opens (entering) | Penalty |
|---|---|
| RO32 (re-draft) | primary **−3** / secondary **free** |
| RO16 | **−10** |
| QF | **−15** |
| SF | **−20** |
| Final | **−25** |

Secondary switch at RO32 is free — the re-draft is the one moment players can
adjust their wildcard without cost. Only the primary swap at RO32 costs −3.
From RO16 onward there is only one team, so only the primary escalating ladder
applies.

### 4. Team pools
- **RO32 re-draft:** primary chosen from the **top 12 surviving teams by FIFA
  ranking**; secondary from the **other 20 survivors**. (Keeps the philosophy:
  primary = favourite at 1×, secondary = underdog at 2×.) Top 12 by actual
  June 2026 rankings: Argentina, France, Spain, England, Brazil, Morocco,
  Netherlands, Portugal, Mexico, Belgium, Colombia, Germany.
- **RO16 onward:** any surviving team.

### 5. The collapse (RO32 → RO16)
- The **secondary concept dissolves** here.
- **Secondary farewell bonus:** if your secondary advanced out of the RO32 (i.e.
  reached the RO16), it pays the RO16 milestone at 2× = **+20**, once. This is the
  only thing a secondary can ever earn — its team had already "reached RO32" at
  the re-draft, so RO16 is its single shot.
- After the payout you hold **one team**. If *both* your teams survived into the
  RO16, you **choose which one to keep** — free, because the collapse is forced,
  not a voluntary swap. The other is released.

### 6. Progression-bonus ladder

| Milestone | Bonus (base) |
|---|---|
| Reach RO32 (survive group) | **+3** |
| Reach RO16 | **+10** |
| Reach QF | **+20** |
| Reach SF | **+30** |
| Bronze Final win (3rd place) | **+35** |
| Runner-up (lose the Final) | **+40** |
| Win the tournament (champion) | **+50** |

> **Reach-based vs placement-based.** RO32 → SF are **reach** milestones: every
> team that advances to the round earns it, *including the ones that then lose in
> it* (all 4 semi-finalists got reach-SF +30). The ladder **stops reaching at SF**.
> The last four prizes are **placement** prizes decided by the Final and Bronze
> results, and they are **mutually exclusive** — there is **no "reach Final"
> award, so both finalists do NOT get +40**. The losing finalist gets +40, the
> champion gets +50 (instead of, not on top of, +40), the Bronze winner gets +35,
> and the Bronze loser gets nothing beyond the reach-SF +30 already banked. None
> can be awarded until the respective match is played. This matches the
> user-facing `/rules` page, which is the source of truth.

Multipliers: **primary 1×, secondary 2×** (clean 2× across all milestones —
RO32 is +3/+6, RO16 is +10/+20, etc.). A secondary earns exactly two things over
its life: **reach-RO32 +6** (scored against the original onboarding secondary
when the group stage ends) and the **reach-RO16 +20 farewell** (scored against
the re-draft secondary at the collapse). It earns nothing in between, and
dissolves after the collapse.

### 7. Bonus retention
Bonuses already banked from a team **stay banked** when you swap away from it.
The swap penalty is the only cost; there is no clawback of past points.

---

## State machine

| Phase | Teams held | Swap cost | Scoring |
|---|---|---|---|
| **Group → RO32** (re-draft window) | pick primary (top 12) + secondary (20) | −3 / free | — |
| **During RO32** | primary + secondary | — | reach-RO16: primary +10, secondary +20 (2×) |
| **RO32 → RO16** (collapse) | → one team (pick if both survive) | free (forced) | secondary +20 farewell, then dissolves |
| **RO16 → QF** | one team | −10 | reach-QF +20 |
| **QF → SF** | one team | −15 | reach-SF +30 (last reach milestone) |
| **SF → Final** | one team | −20 | — (placement prizes settle after the matches) |
| **Final + Bronze** | one team | −25 (Final) | Win +50 / Runner-up +40 / Bronze-win +35 (placement) |

---

## Operational runbook — awarding progression bonuses

Progression bonuses are **awarded manually, one migration per milestone** — there
is **no runtime trigger** (`lib/server/progression.ts` is a pure engine that no
route calls). Repeat this at each round boundary once results are in:

| Milestone | Migration | Amounts | Scored against |
|---|---|---|---|
| reach-RO32 | `024` ✅ | primary +3 / secondary +6 | onboarding picks (`league_members`) |
| reach-RO16 | `029` ✅ | primary +10 / secondary +20 (farewell) | RO32-held teams (`member_round_teams` @ ro32, else onboarding) |
| reach-QF | `031` ✅ | +20 | R16-held single team |
| reach-SF | `033` ✅ | +30 | QF-held single team |
| win-bronze | **TODO** | +35 | Bronze-held team that **won** the 3rd-place match |
| runner-up | **TODO** | +40 | Final-held team that **lost** the Final |
| win | **TODO** | +50 | Final-held team that **won** the Final |

From RO16 on it is **one team** (the collapse), so **QF onward is primary-only —
no secondary rows**. Always `on conflict (league_member_id, milestone, nation_id)
do nothing` for idempotency.

Two scoring modes:
- **Reach milestones (RO32 → SF):** "reached round X" = the held team's
  `nations.eliminated = false` at that boundary. Inclusive — a team that loses in
  round X still reached it.
- **Placement prizes (win-bronze / runner-up / win):** NOT reach-based and NOT
  `eliminated = false`. Scored against the **specific match result** — the held
  team must be the winner (win, win-bronze) or the loser (runner-up) of that exact
  fixture. There is **no reach-Final award**, so the two finalists split +50 / +40
  by result; they do not both get +40.

---

## Worked example

Player holds primary **Spain** (alive, in RO32) and secondary **Curaçao** (dark
horse, in RO32).

- **RO32 re-draft:** keeps both (free).
- **RO32 results:** Spain advances → primary reach-RO16 **+10**. Curaçao advances
  → secondary reach-RO16 **+20** (2× farewell). Curaçao concept now dissolves.
- **Collapse:** both survived, player keeps **Spain** as the single team (free).
- **RO16 → QF:** Spain drew Brazil next; player bails to **Argentina** → **−8**.
- Argentina reaches SF → **+30**, loses SF.
- **Net from QF boundary on:** −8 + 30 = **+22**.

---

## Prerequisites & implementation notes

**⚠️ #0 — Progression bonuses don't exist yet.** The rules page advertises
+5/+10/… but `app/api/admin/match-score/route.ts` only awards *per-match*
win/draw nation bonuses (primary 1×, secondary 2×). No code detects "team reached
round X" or reads `eliminated_in_round`. **This entire design depends on
progression bonuses, so they must be built first.** Decide explicitly: in the
knockouts, is the scoring currency the *progression milestones* (new), the
existing *per-match win bonus*, or both? (Spec above assumes progression
milestones are the knockout currency.)

**#1 — `rounds` table.** Only `group_stage` + a mislabeled `r16` are seeded. Seed
the full ladder (RO32, RO16, QF, SF, Final) with dates and wire each match's
`round_id`.

**#2 — Team-holding history.** `league_members.primary_nation_id` /
`secondary_nation_id` are single mutable fields with **no history**. Need a
per-member-per-round record of which teams were held and whether a swap happened —
e.g. `member_round_teams(league_member_id, round_id, primary_nation_id,
secondary_nation_id, primary_swapped bool, secondary_swapped bool,
penalty_applied int)`.

**#3 — Penalties in the leaderboard.** `computeLeaderboard` currently sums
prediction points + `nation_bonus_points`. Swap penalties must be **subtracted**.
Cleanest: a `swap_penalties` ledger (or negative `nation_bonus_points` rows)
folded into the total.

**#4 — Board-open window.** Reassignment is admin-gated per boundary (mirror the
existing `allow_late_predictions` pattern: an open/close window so players can't
swap after the next round kicks off). `nations.eliminated` /
`eliminated_in_round` already exist for the admin to set when scoring.

**#5 — UI.** A reassignment screen (reuse the onboarding nation-picker), the pool
filtering (top-10 / 22 at RO32), the penalty confirmation ("Swap to Argentina for
−8?"), and the collapse "pick which team to keep" prompt.

---

## Related — bracket prediction contest (separate feature)
A distinct side contest, NOT part of the re-draft: a page where each player
predicts the **winner of all 16 RO32 matches** (who advances to the RO16) before
the first RO32 match kicks off. Separate scoring from the bonus-team mechanic.
- **Re-draft** = reassign your own bonus-scoring teams (this spec).
- **Bracket** = predict which 16 teams advance; scored per correct call.
Needs its own table (e.g. `ro32_bracket_picks`), a submission window closing at
first kickoff, and a results view. To be specced separately.

## Deferred / not in scope
- Auto-detecting eliminations from a feed (admin sets it manually for now).
- Notifying players when their team is knocked out (ties into the personalized
  push-notification idea).
