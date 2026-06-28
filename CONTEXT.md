# Fantasy WC 2026 — Context

A private prediction + nation-pick league for FIFA World Cup 2026. One league, invite-only, ~15 players.

---

## Glossary

| Term | Definition |
|---|---|
| **League** | Single private group (`leagues` table). One league exists: "Jay's League", invite code `JFWC26`. |
| **Member** | A user who has joined the league (`league_members`). The league creator (admin) is excluded from leaderboard display. |
| **Prediction** | A member's scoreline guess for a match, submitted before the prediction deadline. |
| **Primary nation** | A member's #1 nation pick — any ranked nation. Earns +3 pts on win, +1 pt on draw. |
| **Wildcard nation** | A member's dark-horse pick — must be ranked outside the FIFA top 15. Earns 2× points (+6 win, +2 draw). First-come-first-serve: each nation can only be claimed by one member per league. |
| **Nation bonus** | Points earned from primary/wildcard nation results, stored in `nation_bonus_points`. Awarded by admin via the score results flow. |
| **Late window** | Admin-controlled post-kickoff prediction window. Set via `allow_late_predictions = true` and `prediction_deadline = <timestamp>` on a match. |
| **Round** | A tournament stage (`rounds` table). Group stage ID: `a0000000-0000-0000-0000-000000000001`. R16 ID: `a0000000-0000-0000-0000-000000000002`. |
| **Re-draft** | At each knockout round boundary, players may swap their held team(s) for surviving teams. Keeping is free; swapping costs an escalating penalty. |
| **Primary pool** | The top 12 surviving teams by FIFA ranking — the only teams selectable as a primary at the RO32 re-draft. |
| **Secondary pool** | The other 20 surviving teams — the only teams selectable as a wildcard at the RO32 re-draft; switching is free. |
| **Collapse** | The RO32→RO16 transition where the secondary concept dissolves and a player carries forward exactly one team. |
| **Progression bonus** | Points for a held team reaching a knockout milestone (RO32 +3 … win +50), stored in `progression_bonus_points`. Primary 1×, secondary 2×. |
| **Swap penalty** | Points deducted for changing a held team during a re-draft window, stored in `swap_penalties`. |
| **Re-draft window** | Admin-gated open/close window per knockout round (`redraft_windows` table) during which swaps are allowed. |

---

## Scoring Rules

### Predictions
| Outcome | Points |
|---|---|
| Correct result (right winner or draw, wrong score) | +1 pt |
| Exact scoreline | +3 pts |

### Nation Picks
| Outcome | Points |
|---|---|
| Primary nation wins | +3 pts |
| Primary nation draws | +1 pt |
| Wildcard nation wins | +6 pts (2×) |
| Wildcard nation draws | +2 pts (2×) |

### Nation Round Progression Bonuses
| Milestone | Points |
|---|---|
| Reach Round of 32 | +3 pts |
| Reach Round of 16 | +10 pts |
| Reach Quarter-finals | +20 pts |
| Reach Semi-finals | +30 pts |
| Win Bronze Final | +35 pts |
| Reach the Final (runner-up) | +40 pts |
| Win the tournament | +50 pts |

**Total score = prediction points + nation bonus points.**

---

## Prediction Deadline Logic

- Predictions lock at **kickoff time** by default.
- Admin can open a **late window** per match:
  - Toggle in admin panel sets `allow_late_predictions = true` and `prediction_deadline = now() + 45 min`.
  - Custom deadline: run SQL `UPDATE matches SET prediction_deadline = now() + interval 'X minutes' WHERE id = N`.
- The API (`/api/predictions`) enforces the deadline server-side — it checks `allow_late_predictions` and `prediction_deadline`, not just kickoff time.
- The predict screen shows a gold `⚡ Xm left` chip when a late window is open.

---

## DB Schema (key tables)

```
profiles           id (uuid, FK auth.users)
leagues            id, name, invite_code, invite_closed, creator_id, max_players
league_members     id, league_id, user_id, profile_name, avatar_id,
                   primary_nation_id, secondary_nation_id
                   UNIQUE(league_id, secondary_nation_id)  ← wildcard first-come-first-serve
nations            id (int), name, flag_code, fifa_ranking, eliminated, eliminated_in_round
rounds             id (uuid), name, start_date, end_date
matches            id (int), round_id, home_nation_id, away_nation_id,
                   kickoff_time, home_score, away_score, status,
                   group_label, venue_city, venue_name,
                   allow_late_predictions, prediction_deadline
predictions        id, league_id, user_id, match_id,
                   predicted_home_score, predicted_away_score, submitted_at, points
                   UNIQUE(league_id, user_id, match_id)
prediction_round_scores  league_id, user_id, round_id, total_points
nation_bonus_points      league_member_id, match_id, nation_id, pick_type, points
avatars            id, footballer_name, initials, nation, position
```

---

## App Routes

| Route | Description |
|---|---|
| `/` | Home — next match hero card, open predictions list, rank tile |
| `/predict` | Swipeable match prediction cards |
| `/predict/history` | Past predictions with points |
| `/ranks` | Prediction leaderboard |
| `/nation` | Your nation picks + bonus points earned |
| `/rules` | Scoring rules and how-it-works |
| `/admin` | Score results, toggle late predictions, manage matches |
| `/onboarding` | Name, avatar, primary + wildcard nation picker |
| `/join` | Auth (Google / magic link) + invite code gate |
| `/squad` | Disabled (Fantasy Phase 3) |

## API Routes

| Route | Description |
|---|---|
| `POST /api/predictions` | Upsert a prediction; enforces deadline server-side |
| `POST /api/admin/match-score` | Score a match; awards prediction + nation bonus points |
| `GET /api/match-predictions-summary` | Returns predictions per match for admin view |

---

## What's Built

- Auth: Google OAuth + magic link, invite-code gate
- Onboarding: profile name, avatar pick, primary + wildcard nation pick
- Predictions: pre-kickoff + admin-controlled late window
- Nation bonus points: primary (1×) + wildcard (2×), round progression bonuses
- Leaderboard: prediction pts + nation bonus pts combined
- Admin panel: score results, toggle late predictions per match
- Rules page: full scoring breakdown

## Fantasy League (Deferred — Phase 3)

Schema is fully built but the feature is hidden behind `NEXT_PUBLIC_FANTASY_ENABLED`. Blocked on player stats auto-sync.

### Glossary additions
| Term | Definition |
|---|---|
| **Squad** | 11-player team picked by each member per round, capped at 100.0 budget |
| **Starting XI** | 11 players marked `is_starting = true`; bench players score 0 unless captain DNP |
| **Captain** | One player per squad — scores 2× points for that match |
| **Vice-captain** | Scores 2× only if captain played 0 minutes |
| **Transfer** | Swap one player out for another during a transfer window. First transfer per window is free; subsequent cost 1.0 from squad cap |
| **Transfer window** | Admin-controlled window (`transfer_windows` table) with opens_at / closes_at timestamps |
| **Price rise** | After a round ends, any player scoring ≥5 fantasy pts gets +0.5 price increase |

### Fantasy Scoring (per player per match)
| Event | Points |
|---|---|
| Goal scored | +5 |
| Assist | +3 |
| Clean sheet (GK or DEF, 90 min) | +4 |
| Yellow card | −1 |
| Red card | −3 |
| 60+ minutes played | +1 |
| Captain | 2× all of the above |

### Squad Rules
- Budget cap: **100.0** per squad
- Squad size: **11 starting** (no formal bench size defined — bench players just have `is_starting = false`)
- Exactly **1 captain**, **1 vice-captain** per squad
- Squads carry over between rounds via `carryover_squad()` DB function

### Player Pool
58 players seeded across 4 positions (8 GK, 16 DEF, 18 MID, 16 FWD) from the top nations. Prices range 4.5–12.5.

### Fantasy DB Tables
```
football_players       id (int), name, nation_id, position, current_price, initial_price
fantasy_squads         id, league_id, user_id, round_id, squad_value_cap
fantasy_squad_players  squad_id, player_id, is_starting, is_captain, is_vice_captain
fantasy_transfers      league_id, user_id, round_id, player_out_id, player_in_id, is_free, cap_cost
transfer_windows       round_id, window_number, opens_at, closes_at
player_match_stats     match_id, player_id, goals, assists, yellow_cards, red_cards, minutes_played, clean_sheet, fantasy_points
fantasy_round_scores   league_id, user_id, round_id, total_points
```

### Fantasy API Routes (built, inactive)
| Route | Description |
|---|---|
| `POST /api/fantasy/squad` | Save/update squad for a round |
| `POST /api/fantasy/transfer` | Execute a transfer within a window |
| `POST /api/admin/transfer-window` | Open/close a transfer window |
| `POST /api/admin/match-stats` | Input player stats for a finished match |

### What's blocking fantasy launch
1. **Player stats input** — currently manual via `/api/admin/match-stats`. ESPN public API (`site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard`) can auto-sync stats — no API key needed.
2. **UI** — `/squad` and `/squad/transfers` pages exist but are hidden. Flip `NEXT_PUBLIC_FANTASY_ENABLED=true` to enable.

---

## What's Deferred

- **ESPN auto-sync** — cron endpoint to auto-update match scores + player stats from ESPN public API. Removes all manual admin work.
- **WhatsApp share card** — `/api/og` shareable image (rank + points). High engagement driver, planned before R16.

---

## Key Config

- **Invite URL**: `https://fantasy-wc-2026-ashy.vercel.app/join?code=JFWC26`
- **Admin email**: `fantasywc2026@gmail.com`
- **Wildcard eligibility (group stage)**: FIFA ranking > 15
- **RO32 re-draft primary pool**: top 12 by FIFA ranking (Argentina → Germany)
- **RO32 re-draft secondary pool**: other 20 surviving teams; secondary switch free at RO32
- **Max players**: 20 (admin excluded from leaderboard)
