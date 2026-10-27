# Idle F1

A mobile-first idle racing game. Run your own F1 team, upgrade your cars, and beat the real-world teams to the Constructors' title.

![Style reference](docs/reference/style-reference.jpg)

## Overview

- **Platform:** mobile-first PWA (Phaser + TypeScript + Vite), Capacitor packaging later.
- **Style:** dark UI, 2D top-down track view, upgrade cards, bottom tab bar.
- **Seasons:** each season is a stage of 10 races. One of your drivers must win the Drivers' championship (2025 points) to advance. Also winning the Constructors' title skips a season (+2); a Drivers' 1-2 plus the Constructors' title skips two (+3). The Race tab's list toggles between race positions and season standings. Rivals get 30% stronger every season (compounding).
- **Prestige & R&D:** once rivals are unbeatable, prestige from Season 3+ to return to Season 1 Race 1. The further you got, the more research points (RP) you earn. R&D is bought only with RP, on the same Prestige tab, and is permanent: Top Speed (faster on straights), Cornering (faster in corners), Tap Power, Tyre Science (less wear), Energy Recovery (tap boost lasts longer), Funding (+25% income and prizes) and Seed Money, plus free levels in each car stat. Each circuit's curvature is measured, so long-straight tracks reward Top Speed and twisty ones reward Cornering. Research, gems and Auto survive a prestige; money, car upgrades and sponsors reset.
- **Sponsors:** spend gems to book a meeting with a sponsor (each signed sponsor makes the next meeting cost more). Each has a hidden budget and you only see a rough range. Pitch an amount: at or under their budget they sign and pay that amount at the start of every new season, until you prestige; over it, talks collapse and the gems are lost. Gems currently come only from season titles.
- **Teams:** the player names their own team; rivals are real F1 teams and drivers.
- **Cars:** 2 per team; Constructors' points are the sum of both.
- **Play:** tap to boost and make strategy calls for free. Each of your two cars has its own row of controls: push/normal/conserve mode, the next tyre (soft/medium/hard), and its own pit call. Tyres only change in the pit lane when the car reaches the start/finish line. Auto (auto-buy, auto-strategy, auto-tap) is a paid unlock; auto-strategy manages each car separately.

See [docs/SPEC.md](docs/SPEC.md) for the full v1 spec and [docs/ROADMAP.md](docs/ROADMAP.md) for the build order.

## Status

v1 playable: all six roadmap steps are implemented. Purchases and ads are stubs (see `src/game/monetization.ts`).

## Run

```
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # production build
```

## Credits

Real circuit outlines for all 40 tracks come from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT License, unofficial data, not endorsed by Formula One Licensing B.V.).

## Contributing

Work is tracked through GitHub issues and the roadmap. Branch from `main`, open a PR, and link the issue it closes.
