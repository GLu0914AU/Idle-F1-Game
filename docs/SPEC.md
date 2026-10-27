# Idle F1: v1 Spec

## Layout (portrait mobile)

- **Top HUD:** team name, money, gems, settings.
- **Season bar:** "Season N · Race X/10", championship position and points.
- **Track view:** top-down circuit, cars as coloured sprites, mini position tower.
- **Stats strip:** income per second, car rating, 2x Speed button.
- **Upgrade cards (2-column):** Engine, Aero, Tyres, Brakes, Reliability, Pit Crew, each showing `current→next` and cost.
- **Tabs:** Race, Team, Standings, R&D, Shop.

## Season structure

- 10 races per season, F1 points 25/18/15/12/10/8/6/4/2/1.
- Must finish 1st in the Constructors' standings to advance; otherwise replay the season keeping upgrades, or prestige reset.
- Rivals are the real teams; their ratings scale each season.
- A simplified version of a real circuit for each race.

## Active play vs Auto

- **Free:** tap to boost (upgradeable tap size), tap in pit windows for faster stops, strategy calls (pit timing, tyre compound, push/conserve) on a cooldown.
- **Paid (one-time):** Auto, covering auto-buy, auto-strategy and auto-tap.
- **Optional boosts:** rewarded ads or gems for 2x speed and temporary boosts (stubbed in v1).

## Economy

- Upgrade cost = `base × 1.15^level`.
- Race payout = `prize(position) × sponsors`, plus a small per-lap trickle.
- Car rating comes from stats with diminishing returns and sets lap time.

## Tech

- Phaser + TypeScript + Vite, PWA config.
- Capacitor for app stores later.
- Saves in localStorage; cloud saves later.
