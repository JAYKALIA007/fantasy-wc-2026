# Deferred Ideas

## WhatsApp Share Card
- `/api/og` route generating a shareable image (rank + points + avatar card)
- One tap to share to group chat
- High engagement driver — add before Round of 16

## ESPN Auto-Sync for Match Scores
- Cron endpoint hitting ESPN public API every hour
- Auto-updates `matches.home_score`, `away_score`, `status = 'finished'`
- Fires `score_prediction()` for all predictions on completed matches
- Removes all manual admin work for results
- ESPN API: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard`
- No API key needed, no documented rate limit

## Pick Your Nation (Phase 2)
- Add `nation_id` to `league_members`
- Nation picker step in onboarding
- Bonus scoring: +3 win, +1 draw, +5 R32, +10 R16, +15 QF, +20 SF, +50 final win
- Show combined score on leaderboard

## Full Fantasy League (Phase 3)
- Blocked on auto-sync API (need player stats per match)
- Squad builder, transfers, price changes all built — just disabled
- Flip `NEXT_PUBLIC_FANTASY_ENABLED=true` when ready
