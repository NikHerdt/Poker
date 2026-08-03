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
- Optional tournament blind levels: raise blinds every N hands or every N minutes
- Side pots and all-in handling
- Rebuy when you're out of chips; spectators can request to join
- Optional Pot Limit Omaha (PLO) via in-game vote
- House rules: 7-2 and 6-9 bonuses, three pair beats two pair
- Field goal minigame (optional raise reversal), playable by tap or space bar
- Test mode for dealing rigged hands that exercise the house rules

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
| 7-2  | Winning the pot holding 7-2 collects one big blind from every other player dealt into the hand |
| 6-9  | Same, but one small blind |
| Three pair | With an identical two pair, the hand whose seven cards contain a third pair wins |
| Field goal | Once per player per room, a kick minigame that reverses the last raise if it is good |

Bonuses are paid by everyone else dealt into the hand — folding early does not
get you out of it — and are capped at what a player actually has, so the
table's chip total never changes. Winning by making everyone fold pays the
bonus too. At a showdown the 7-2 (or 6-9) has to be the hand that actually won,
as high card: flopping trips with 7-2 wins the pot but not the bonus.

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
