# Knockout-Stage Team Reassignment — Spec

**Status:** Design locked (grilled 2026-06-21). Not yet implemented.
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
| RO32 (re-draft) | primary **−5** / secondary **−3** |
| RO16 | **−5** |
| QF | **−8** |
| SF | **−10** |
| Final | **−12** |

Only the single-team / primary swap escalates. The −3 secondary penalty exists
only at the RO32 re-draft (secondary dissolves after RO32 — see §5).

### 4. Team pools
- **RO32 re-draft:** primary chosen from the **top 10 surviving teams by FIFA
  ranking**; secondary from the **other 22 survivors**. (Keeps the philosophy:
  primary = favourite at 1×, secondary = underdog at 2×.)
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

| Milestone | Bonus |
|---|---|
| Reach RO32 (survive group) | **+5** |
| Reach RO16 | **+10** |
| Reach QF | **+20** |
| Reach SF | **+30** |
| Reach Final (runner-up) | **+40** |
| Win the tournament | **+50** |

Multipliers: **primary 1×, secondary 2×.** (Secondary only ever earns the RO16
milestone, at 2× = +20, per §5.)

### 7. Bonus retention
Bonuses already banked from a team **stay banked** when you swap away from it.
The swap penalty is the only cost; there is no clawback of past points.

---

## State machine

| Phase | Teams held | Swap cost | Scoring |
|---|---|---|---|
| **Group → RO32** (re-draft window) | pick primary (top 10) + secondary (22) | −5 / −3 | — |
| **During RO32** | primary + secondary | — | reach-RO16: primary +10, secondary +20 (2×) |
| **RO32 → RO16** (collapse) | → one team (pick if both survive) | free (forced) | secondary +20 farewell, then dissolves |
| **RO16 → QF** | one team | −5 | reach-QF +20 |
| **QF → SF** | one team | −8 | reach-SF +30 |
| **SF → Final** | one team | −10 | reach-Final +40 |
| **Final** | one team | −12 | Win +50 |

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

## Deferred / not in scope
- Auto-detecting eliminations from a feed (admin sets it manually for now).
- Notifying players when their team is knocked out (ties into the personalized
  push-notification idea).
