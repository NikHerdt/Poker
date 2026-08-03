# Poker

Multiplayer Texas Hold'em (and optional Pot Limit Omaha) over the web. Create a room, share the code, and play in real time via WebSockets.

## Tech stack

- **Client:** React, Vite, TypeScript
- **Server:** Node.js, TypeScript (tsx), WebSocket (ws)
- **Shared:** Types and hand evaluation in a common `shared` package

## Project structure

```
Poker/
  client/       React app (Vite dev server, static build for deploy)
  server/       WebSocket game server (Node)
  shared/       Types, constants, hand evaluation (used by both)
```

## Prerequisites

- Node.js 18+ (20 or 22 recommended)
- npm

## Running locally

Install dependencies and run the server and client in two terminals.

**Terminal 1 – server**

```bash
npm install
cd server && npm install && cd ..
npm run server
```

Or with auto-reload:

```bash
npm run server:dev
```

**Terminal 2 – client**

```bash
npm run client
```

Then open the URL Vite prints (usually `http://localhost:5173`). The client connects to the server at `localhost:3001` by default.

> **Restart the server after pulling changes.** `npm run server` does not watch
> for edits, so a server started earlier keeps running old code — which shows up
> as missing buttons, `NaN` bet amounts, blinds that never rise or "only host
> can start next hand". The client detects this and shows a banner telling you
> to restart. Use `npm run server:dev` while developing to reload automatically.

**Scripts (from repo root)**

| Command           | Description                |
|-------------------|----------------------------|
| `npm run server`  | Start the game server      |
| `npm run server:dev` | Server with watch/reload |
| `npm run client`  | Start the Vite dev client  |
| `npm run client:build` | Build client for production |
| `npm test`        | Run the engine/house-rule test suite |

## Features

- Create or join rooms by code; host starts the game
- Texas Hold'em with configurable blinds and buy-in
- Round table view that fits a phone screen: every seat, bet and card visible at once
- Optional tournament blind levels: raise blinds every N hands or every N minutes
- Standard betting minimums, with a stepper and pot-fraction shortcuts
- Side pots and all-in handling
- Rebuy when you're out of chips; players can join mid-game with host approval
- Showing your hand at the end is optional — nothing is revealed automatically
- Optional Pot Limit Omaha (PLO) via in-game vote
- House rules: 7-2 and 6-9 bonuses, three pair beats two pair
- Field goal minigame (optional raise reversal), playable by tap or space bar
- Test mode for dealing rigged hands that exercise the house rules

## At the table

Seats are arranged around the table with you at the bottom, so the layout reads
the same for everyone. Chips each player has bet this round sit on the felt in
front of them and slide in as they bet; the pot in the middle is everything
committed to the hand. The seat shows the player's last action — check, call,
**bet**, **raise** or all-in — and the winner gets a badge when the hand ends.

Your own hand is shown next to the action buttons at full size, with the ranks
spelled out beside it, so the seats can stay small enough for a full table
without your cards becoming hard to read.

Board cards sail in and are dealt face down then flipped, bets slide out from
the player who made them, chips are raked into the middle when a betting round
closes and pushed out to the winner at the end, the pot counts up rather than
jumping, and the seat on the clock pulses. All of it honours
`prefers-reduced-motion`.

**Table size** runs from 2 to 12 players. Past 8 the seats, cards and badges
shrink and the ring widens so a full table still fits a phone screen without
scrolling. Pot Limit Omaha deals four cards each, which does not fit in a deck
beyond 11 players, so the PLO vote is unavailable above that and a PLO round
reverts to Hold'em if the table grows.

**Betting** follows normal table rules. With no bet in front of you the choice
is check or **bet** (minimum one big blind); facing a bet it is call or
**raise** (minimum: the size of the last bet or raise, on top of it). Both
minimums reset each street, and you can always shove for less. The amount has a
slider, − / + buttons that step by a big blind, and Min / ½ pot / Pot / All-in
shortcuts.

**Showing cards** is opt-in. Hole cards are never sent to other players'
browsers — not just hidden in the UI — so the only way anyone sees your hand is
if you press *Show my cards* after the hand.

**The clock.** Whoever is on the clock has 60 seconds, counted down in their
seat so the whole table can see it. Run out and the server acts for you: it
checks if that costs nothing, and folds otherwise. The countdown is the
server's, so closing a tab or losing signal cannot stall the table.

**Dealing.** The host opens the game, but once it is running *Next hand* is
available to everyone — no waiting on one person between hands. It stays
disabled until any busted players have answered their rebuy prompt and at least
two players are in.

## Seats, joining and leaving

Players keep a fixed seat for the life of the room, and the button moves one
seat per hand. Because the button follows seats rather than a player count,
rebuying, sitting out, joining and leaving never reshuffle the table or make the
blinds skip or repeat.

- **Joining a game in progress** puts you in as a spectator with a request to
  the host, who gets Admit / Decline buttons. Admitted players take the last
  seat and are dealt in on the next hand.
- **Leaving**, or dropping the connection, folds that player out of the hand in
  progress and frees their seat, so everyone else carries on straight away. If
  that leaves one player, they take the pot.
- **Rebuying** keeps your original seat.

## Blind levels (tournament style)

Set this when creating a room. Blinds start at the configured small/big blind
(level 1) and are multiplied each level — 2x by default, up to level 12.

- **Every N hands** – the level goes up when hand `N * level + 1` is dealt.
- **Every N minutes** – the level goes up on the first hand dealt after the
  timer expires.

Levels are only evaluated when a hand starts, so blinds never change mid-hand.
The table header shows the current level, the blinds in play and when the next
level arrives. PLO hands still double the level's blinds, as before.

## House rules

| Rule | Effect |
|------|--------|
| 7-2  | Win the pot holding 7-2 and collect one big blind from every other player dealt into the hand |
| 6-9  | Same, but one small blind |
| Three pair | With an identical two pair, the hand whose seven cards contain a third pair wins |
| Field goal | Once per player per room, a kick minigame that reverses the last raise if it is good |

Winning the pot is the only condition: it pays at a showdown, it pays when you
bluff everyone out, and it pays whether the 7-2 stayed 7-high or turned into a
full house. Everyone else dealt into the hand pays — folding early does not get
you out of it — capped at what a player actually has, so the table's chip total
never changes. A 7-2 that loses pays nothing.

The field goal can only reverse a raise inside the betting round it was made
in. Once everyone has called and the next card is dealt, the raise is part of
the pot and is no longer reversible.

## Testing

`npm test` runs the server-side suite (`node --test` via `tsx`) covering hand
evaluation, the house rules, blind levels and the field goal reversal:

```bash
npm test
```

**Test mode** does the same checks in the live app. Tick "Test mode" when
creating a room, and the host gets a scenario picker in the lobby and after
every hand. Picking one stacks the deck for the next hand — seat 1 is dealt
7-2, an identical two pair is set up, and so on — so a rule can be confirmed
against real chip movement. Scenarios live in `shared/test-scenarios.ts`; add
one there and it appears in both the app and the test suite.

## Deployment

- **Server:** Deploy the Node/WebSocket server to [Render](https://render.com) (free tier). See **[DEPLOY.md](DEPLOY.md)** for step-by-step setup and the `render.yaml` blueprint.
- **Client:** Build with `npm run client:build` and host the `client/dist` output on GitHub Pages or any static host. Configure the client to use your deployed server’s WSS URL (e.g. via `VITE_WS_URL` or your build config).

Details and troubleshooting are in **DEPLOY.md**.

## License

Private / unlicensed unless you add one.
