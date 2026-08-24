# HRAPP — Android remote-management vertical slice

Spec: [docs/MASTER.md](docs/MASTER.md). Decisions: [docs/adr/](docs/adr/). Progress log: [docs/PROJECT_PROGRESS.md](docs/PROJECT_PROGRESS.md).

Current scope: the vertical slice only — pair → PLAY_SOUND → ACK → audit. Nothing else from MASTER.md is built yet.

## Run it

**1. Relay server** (pairing + command routing + audit log):
```
cd relay-server
npm install
node server.js
```
Self-check (proves pair → auth → PLAY_SOUND → ACK → audit end to end):
```
node test_vertical_slice.js
```

**2. Controller UI** (in a second terminal):
```
cd controller
node server.js
```
Open http://localhost:3000.

**3. Android agent** — real Kotlin app, `android-agent/`. Build it with `android-agent/build.bat`
(run in your own terminal, not through an automated tool — see note in that file). Produces
`android-agent/app/build/outputs/apk/debug/app-debug.apk`. Install with `adb install -r <path>`,
open the app, it shows a 6-digit pairing code — enter that in the controller UI, then press
"Push to Sound" and the phone should play a two-beep sound and report back.

**No phone handy?** `relay-server/fake_agent.js` stands in for the real agent — run it, it prints
a pairing code, use that in the controller UI instead.

## What's not built yet

Everything else in MASTER.md — screen, remote input, location, usage, notifications, apps,
restrictions, camera/mic/calling. See docs/MASTER.md §38 for the phase order.
