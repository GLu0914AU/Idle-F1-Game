# Idle F1

A mobile-first idle racing game. Run your own F1 team, upgrade your cars, and beat the real-world teams to the Constructors' title.

![Style reference](docs/reference/style-reference.jpg)

## Overview

- **Platform:** mobile-first PWA (Phaser + TypeScript + Vite), Capacitor packaging later.
- **Style:** dark UI, 2D top-down track view, upgrade cards, bottom tab bar.
- **Seasons:** each season is a stage of 10 races. Finish 1st in the Constructors' standings to unlock the next one. Rivals get 30% stronger every season (compounding).
- **Prestige:** once rivals are unbeatable, prestige from Season 3+ to return to Season 1 Race 1. The further you got, the more research points (RP) you earn. RP buy permanent research: free levels in each car stat and Tap Power, +25% Funding, and Seed Money. Research, gems and Auto survive a prestige.
- **Teams:** the player names their own team; rivals are real F1 teams and drivers.
- **Cars:** 2 per team; Constructors' points are the sum of both.
- **Play:** tap to boost and make strategy calls for free: push/normal/conserve mode, and pit calls where you choose the tyre (soft/medium/hard). Tyres only change in the pit lane when the car reaches the start/finish line. Auto (auto-buy, auto-strategy, auto-tap) is a paid unlock.

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
