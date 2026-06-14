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
| Reach Round of 32 | +5 pts |
| Reach Round of 16 | +10 pts |
| Reach Quarter-finals | +15 pts |
| Semi-finals | +20 pts |
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

## What's Deferred

- **Fantasy squad** — squad builder UI exists (`/squad`) but is hidden. Blocked on auto-sync for player stats.
- **ESPN auto-sync** — cron endpoint to auto-update match scores from ESPN public API (no key needed). Would remove all manual admin scoring.
- **WhatsApp share card** — `/api/og` shareable image (rank + points). High engagement driver, planned before R16.
- **Full fantasy league** — transfers, price changes, weekly scoring. Flag `NEXT_PUBLIC_FANTASY_ENABLED` controls visibility.

---

## Key Config

- **Invite URL**: `https://fantasy-wc-2026-ashy.vercel.app/join?code=JFWC26`
- **Admin email**: `fantasywc2026@gmail.com`
- **Wildcard eligibility**: FIFA ranking > 15
- **Max players**: 15
