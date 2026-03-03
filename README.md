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

## Features

- Create or join rooms by code; host starts the game
- Texas Hold'em with configurable blinds and buy-in
- Side pots and all-in handling
- Rebuy when you're out of chips; spectators can request to join
- Optional Pot Limit Omaha (PLO) via in-game vote
- House rules: 7-2 and 6-9 bonuses
- Field goal minigame (optional raise reversal)

## Deployment

- **Server:** Deploy the Node/WebSocket server to [Render](https://render.com) (free tier). See **[DEPLOY.md](DEPLOY.md)** for step-by-step setup and the `render.yaml` blueprint.
- **Client:** Build with `npm run client:build` and host the `client/dist` output on GitHub Pages or any static host. Configure the client to use your deployed server’s WSS URL (e.g. via `VITE_WS_URL` or your build config).

Details and troubleshooting are in **DEPLOY.md**.

## License

Private / unlicensed unless you add one.
