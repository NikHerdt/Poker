# Deploying the Poker server to Render

## Prerequisites

- A [Render](https://render.com) account (free)
- This repo pushed to GitHub

## Steps

### 1. Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) and click **New +** then **Web Service**.
2. Connect your GitHub account if needed, then select the **Poker** repository.
3. Render may auto-detect the `render.yaml` blueprint. If it does, confirm the service and click **Create Web Service**.
4. If it does not use the blueprint, set these by hand:
   - **Name:** `poker-server` (or any name)
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

### 2. Deploy

- After creating the service, Render runs the build and start. Wait for the deploy to finish (status **Live**).
- On the free tier the service may **spin down after ~15 minutes** of no traffic. The next request will wake it (cold start can take 10–30 seconds).

### 3. Get the server URL

- In the Render dashboard, open your **poker-server** service.
- The URL looks like: `https://poker-server-xxxx.onrender.com`
- For WebSockets the client must use **WSS** on the same host, e.g. `wss://poker-server-xxxx.onrender.com` (Render supports WebSocket on the same URL).

### 4. Point the client at this server

When building or running the client for production, set the WebSocket URL to your Render URL, for example:

- **Env (recommended):** set `VITE_WS_URL=wss://poker-server-xxxx.onrender.com` when building the client, and use that in the client code instead of `hostname:3001`.
- Or temporarily change the URL in `client/src/hooks/useGameSocket.ts` for a production build.

Then your GitHub Pages (or other static) client will connect to the server on Render.

## Optional: Use the blueprint (render.yaml)

If you prefer to use the repo’s blueprint:

1. **New +** → **Blueprint**.
2. Connect the **Poker** repo.
3. Render will read `render.yaml` and create the **poker-server** Web Service with the correct root, build, and start commands.
4. Click **Apply** and wait for the first deploy.

## Troubleshooting

- **Build fails with "File '.../shared/...' is not under 'rootDir'":** The build command must be exactly **`npm install`**. Do not use `npm run build` or `npm install; npm run build`. The server runs with `tsx` at runtime; TypeScript’s `tsc` expects all sources under `server/`, but the app imports from `../shared/`. In Render: **Settings → Build & Deploy → Build Command** → set to `npm install` and save.
- **Build fails (other):** Ensure **Root Directory** is `server` so `../shared` resolves when the app runs.
- **Service unhealthy:** The server exposes `GET /` for health checks; if you changed the port or path, update **Health Check Path** in Render to match.
- **WebSocket fails:** Use `wss://` (not `ws://`) when the site is served over HTTPS. The host should be your Render URL without a port (e.g. `wss://poker-server-xxxx.onrender.com`).
