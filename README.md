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

**Full dashboard test (no phone needed):** run `relay-server/fake_agent_full.js` — it speaks the whole
protocol (device info, location, input, lock, sound). Pair with its printed code, then every card in
the controller works end to end. Automated version: `node relay-server/test_modules.js`.

## Built and verified

- Pairing + auth + audit (relay)
- Push-to-Sound (ADR-0004)
- Device info, Location, Remote touch/keyboard, Lock — controller ↔ relay ↔ agent round trips,
  verified live in-browser with Reticle. Android agent code complete (`android-agent/app/`).

## Not built yet / next phase

- Screen mirroring (MediaProjection), mic/camera streaming (foreground service) — MASTER.md §38 phase order.
- **Remote unlock is intentionally NOT included** — Android provides no API for a third-party app to
  dismiss the lock screen; only *lock* is possible (see `docs/PROJECT_PROGRESS.md`).
