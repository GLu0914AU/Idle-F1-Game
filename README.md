# Idle F1

A mobile-first idle racing game. Run your own F1 team, upgrade your cars, and beat the real-world teams to the Constructors' title.

![Style reference](docs/reference/style-reference.jpg)

## Overview

- **Platform:** mobile-first PWA (Phaser + TypeScript + Vite), Capacitor packaging later.
- **Style:** dark UI, 2D top-down track view with procedural scenery (grandstands, trees, ponds, sea and yachts, pit buildings, tyre walls, city blocks, desert dunes) that is unique and consistent per circuit, upgrade cards, bottom tab bar.
- **Seasons:** each season is a stage of 10 races. One of your drivers must win the Drivers' championship (2025 points) to advance. Also winning the Constructors' title skips a season (+2); a Drivers' 1-2 plus the Constructors' title skips two (+3). The Race tab's list toggles between race positions and season standings. Rivals get steadily stronger every season (steeply at first, then in a straight line past season 22). Balance is checked with a headless simulator (`BALANCE=1 npx vitest run src/game/balance.test.ts`): from a fresh save, each prestige reaches roughly 2-5 more seasons than the last.
- **Prestige & R&D:** once rivals are unbeatable, prestige from Season 3+ to return to Season 1 Race 1. The further you got, the more research points (RP) you earn. R&D is bought only with RP, on the same Prestige tab, and is permanent: Top Speed (faster on straights), Cornering (faster in corners), Tap Power, Tyre Science (less wear), Energy Recovery (tap boost lasts longer), Funding (+25% income and prizes) and Seed Money, plus free levels in each car stat. Each circuit's curvature is measured, so long-straight tracks reward Top Speed and twisty ones reward Cornering. Research, gems and Auto survive a prestige; money, car upgrades and sponsors reset.
- **Sponsors:** spend gems to book a meeting with a sponsor (each signed sponsor makes the next meeting cost more). Each has a hidden budget and you only see a rough range. Pitch an amount: at or under their budget they sign and pay that amount at the start of every new season, until you prestige; over it, talks collapse and the gems are lost. Gems currently come only from season titles.
- **Teams:** the player names their own team; rivals are real F1 teams and drivers.
- **Cars:** 2 per team; Constructors' points are the sum of both.
- **Team tab:** rename the team, pick a team colour, and see career stats (races won, drivers' and constructors' titles). Each race win brings 100 fans (kept through prestige). Once per prestige, run a Fan Event: money, gems, research points and clout each roll a chance to drop, scaled by fans.
- **Drivers:** each driver has a skill (percent boost to car rating) and three traits: Tyre Management (less wear), Consistency (fewer breakdowns) and Race Craft (pace at the start of a race, and less pace lost in the wet). Spend clout on the Team tab to meet a driver with a hidden minimum wage, offer a per-race salary and sign them into either seat. Wages come out after every race and a driver you can't pay quits. Drivers and clout survive prestige.
- **Play:** tap to boost and make strategy calls for free. Each of your two cars has its own row of controls: push/normal/conserve mode, the next tyre (soft/medium/hard/intermediate/wet), and its own pit call. About 30% of races have rain, shown as a forecast badge: dry tyres lose a lot of pace on a wet track and wets lose pace when it dries, so watch the forecast. Rivals change tyres themselves, with occasional mistakes. Tyres only change in the pit lane when the car reaches the start/finish line. Auto (auto-buy, auto-strategy, auto-tap) is a paid unlock; auto-strategy manages each car separately.

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
