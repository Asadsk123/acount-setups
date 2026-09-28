# HRAPP Relay — Public Deployment Guide

## IMPORTANT: Why Vercel won't work for the relay

Vercel is serverless — functions time out after 10-30s and cannot hold a persistent WebSocket connection. The HRAPP relay requires long-lived WebSocket sessions (minutes to hours). Use one of the options below instead.

---

## Option A — Cloudflare Tunnel (FREE, fastest, no account needed)

Keeps your PC's relay accessible from anywhere. Phone connects to a stable `*.trycloudflare.com` domain.

### Steps:
1. Start relay: `cd C:\PROJECTS\HRAPP\relay-server && node server.js`
2. Download cloudflared: https://github.com/cloudflare/cloudflared/releases/latest → `cloudflared-windows-amd64.exe`
3. Run tunnel: `cloudflared-windows-amd64.exe tunnel --url http://localhost:8787`
4. Copy the printed URL e.g. `https://abc-123.trycloudflare.com`
5. On the phone, enter: `wss://abc-123.trycloudflare.com` as the relay address

**Limitation**: URL changes each time cloudflared restarts. For stable URL, use Option B.

---

## Option B — Railway (FREE tier, stable URL, proper WebSocket support)

### Steps:
1. Go to https://railway.app → sign up with GitHub
2. New Project → Deploy from GitHub repo → select `Asadsk123/acount-setups`
3. Set Root Directory: `relay-server`
4. Railway auto-detects Node.js from `package.json`
5. Add env variable: `PORT=8787` (or Railway assigns one automatically)
6. Deploy → get URL like `https://hrapp-relay-production.up.railway.app`
7. On phone, enter: `wss://hrapp-relay-production.up.railway.app` as relay address

**Advantage**: Stable URL, free 500 hours/month, proper WebSocket support.

---

## Option C — Render (FREE tier)

1. https://render.com → New Web Service → connect GitHub repo
2. Root directory: `relay-server`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set `PORT` env var to whatever Render assigns
6. Deploy → get stable `https://hrapp-relay.onrender.com` URL

---

## After deployment — update phone

Once you have the public URL, enter it in the app's relay host field:
- Format: `wss://your-relay-domain.com` (for HTTPS/WSS)
- Or: `ws://your-relay-domain.com:PORT` (for plain WebSocket)

The app's `parseTarget()` function handles both formats automatically.

---

## Vercel — what it's good for

Vercel works for the **controller** (static HTML/JS files) but NOT for the relay.

To deploy the controller to Vercel:
```bash
cd C:\PROJECTS\HRAPP\controller
npx vercel --token YOUR_TOKEN
```

Set the environment variable `RELAY_URL` to your Railway/Render relay URL.
