# HRAPP Relay — Stable Deployment (REQUIRED for production)

## Architecture overview

```
Phone APK  →  relay.json (Vercel, stable)  →  Relay server URL
                                             ↑
                                    THIS must be stable
```

- `relay.json` at `https://royal-kids-three.vercel.app/relay.json` — **already stable** (Vercel)
- Relay server — **must be on Railway or Render** (NOT Cloudflare Quick Tunnel)
- CF Quick Tunnel = dev-only, dies when PC restarts, breaks all connected phones

---

## Phase B — Deploy relay to Railway (5 minutes, free)

### One-time setup:

1. Go to **https://railway.com** → sign up / log in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select repo: `Asadsk123/acount-setups`
4. Set **Root Directory**: `relay-server`
5. Railway auto-detects Node.js. Deploy runs automatically.
6. Copy the domain Railway assigns — looks like:
   `hrapp-relay-production.up.railway.app`

### After you have the Railway URL:

Tell me the URL (starts with `https://`) and I will:
- Update `controller/public/relay.json` to point to `wss://your-url`
- Deploy relay.json update to Vercel
- All phones auto-update their relay URL within one reconnect cycle

### Set `INITIAL_PAIRED_DEVICES` (Phase H — pairing persistence):

After first phones pair through Railway, export current pairings to survive redeploys:

```bash
# From relay-server dir, run once after phones pair:
node -e "const fs=require('fs'); console.log(fs.readFileSync('paired-devices.json','utf8'))"
```

Paste the JSON output as a Railway environment variable named `INITIAL_PAIRED_DEVICES`.
New deploys will seed from this value + current file (whichever has more entries wins).

---

## Option B — Render (alternative, also free)

1. https://render.com → New Web Service → connect GitHub
2. Root directory: `relay-server`
3. Build: `npm install`, Start: `node server.js`
4. Render assigns a stable `https://hrapp-relay.onrender.com` URL

Same process: tell me the URL → I update relay.json → all phones auto-switch.

**Note**: Render free tier spins down after 15min inactivity. Railway does not.
Railway is preferred.

---

## DO NOT use for relay (relay needs persistent WebSocket):

- **Vercel** — serverless, kills connections after 10s
- **Cloudflare Quick Tunnel** — dies on PC restart, URL changes every time
- **Netlify** — same as Vercel

---

## Controller (Vercel) — already deployed ✅

`https://royal-kids-three.vercel.app` — serves:
- `/relay.json` — bootstrap config for phones (stable URL)
- `/hrapp-remote.apk` — latest APK download (v1.25)
- Dashboard UI

To redeploy after changes:
```
cd C:\PROJECTS\HRAPP\controller && npx vercel@latest --prod --yes
```
