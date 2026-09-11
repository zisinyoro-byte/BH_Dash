# BH Dash — BTTS Both-Halves Dashboard

An interactive, fully self-contained football analytics dashboard built from the
[openfootball/football.json](https://github.com/openfootball/football.json) open dataset.

It identifies matches where **both teams scored in the first half AND both teams scored
again in the second half** — a much stricter pattern than classic BTTS (both teams to score).

## Deploy it anywhere

The app is a **single static file** (`index.html`, ~1.5 MB) with all data and the charting
library (ECharts 5) embedded. No build step, no server, no database, no environment variables.

**GitHub Pages** (recommended)

```
Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save
```

Live at: `https://zisinyoro-byte.github.io/BH_Dash/`

**Other static hosts** — works identically on all of them:

| Host | How |
|------|-----|
| Vercel | Import the repo, framework preset "Other", deploy |
| Netlify | Drag & drop `index.html` into Netlify Drop |
| Cloudflare Pages | Direct upload or connect the repo |

## Features

| Module | Description |
|--------|-------------|
| KPI cards | Total qualifying matches, share of all evaluable matches, most extreme league |
| League switcher | All 44 competitions, sample-size aware (KPIs require ≥ 30 evaluable matches) |
| Season trend | Matches qualifying per season with peak markers |
| Team rankings | Most appearances in qualifying matches (home + away combined) |
| HT → FT matrix | Half-time to full-time score transitions of qualifying matches |
| Match browser | Searchable, sortable table of every qualifying match |
| Team focus & H2H | Pick any two teams from the league: their head-to-head meetings with qualifying-pattern badges, per-team BTTS records (home/away splits, goal averages) and a side-by-side comparison chart — fully independent of the league analysis above. Each team panel also flags the club's **top both-halves rival** (the opponent it has recorded the most qualifying matches against), highlights those matches in its qualifying list, and offers a one-click "Load H2H" to put that rival in the other slot |
| Next-meeting outlook | For the selected pair: the next scheduled fixture (from embedded 2026-27 / 2026 season schedules) with a statistical estimate of the chance it ends BTTS in both halves — 75% venue-adjusted team rates + 25% head-to-head, shrunk toward the league average when samples are small. Includes per-half estimates and each team's own next-fixture outlook. Historical frequencies, not a guarantee |

## The rule

A match qualifies when, in 90 minutes (extra time / shootouts are ignored):

- Half-time: `home_goals > 0` **and** `away_goals > 0`
- Second half: `(ft_home − ht_home) > 0` **and** `(ft_away − ht_away) > 0`

Example: 1–0 HT → 2–1 FT does **not** qualify (away scored only before the break);
1–1 HT → 2–2 FT does.

## Data coverage

- Source: [openfootball/football.json](https://github.com/openfootball/football.json) (public domain)
- Seasons: 2010-11 → 2026-27 across 44 competitions (top European leagues, cups, UEFA CL, MLS, and more)
- 82,616 evaluable matches → **4,583 qualify (≈ 5.5 %)**; MLS has the highest rate at 8.9 %
- ~6,400 matches lack half-time scores in the source data and cannot be assessed; they are excluded
- Team names are unified automatically: source files spell clubs inconsistently across seasons
  (e.g. `Manchester United` in 2010-11→2019-20 & 2025-26 vs `Manchester United FC` elsewhere;
  60 such variant groups exist). Variants are merged under the most frequent spelling, so team
  stats and head-to-head records always cover the club's full history
- All data is embedded in `index.html`, so the file works completely offline

## License

- Data: openfootball — public domain
- Code: MIT
