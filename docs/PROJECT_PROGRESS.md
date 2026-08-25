# Project progress

## 2026-08-24 — Phase 0: repo foundation

- Repo: `Asadsk123/acount-setups`, working branch `claude/feasibility-check-timeline-f4hpk8` (repo default).
- Reconciled two prior specs into one authoritative `docs/MASTER.md`: the user-supplied platform spec + the earlier `CLAUDE_CODE_ARCHITECTURE.md` review (kept as reference, Push-to-Sound folded in as its own module).
- Resolved the 3 blockers `FEASIBILITY_AND_ESTIMATE.md` flagged as must-decide-before-Phase-1: see `docs/adr/ADR-0001` (distribution: sideload/direct APK, self/family devices), `ADR-0002` (push wakeup: FCM primary, foreground-service fallback), `ADR-0003` (replay protection: nonce+seq, not timestamp window). Push-to-Sound spec captured as `ADR-0004`.
- Added `docs/PROTOCOL.md` (message envelope + v1 message types) and `docs/CAPABILITY_MATRIX.md` (4-layer capability model).
- Controller tech decided: local web UI (React/Next.js) — MASTER.md §51 updated.
- Not started yet: repo module skeleton (android-agent/, controller/, protocol/, relay-server/, shared/), any actual code, Phase 1.

**Next:** build the thin vertical slice recommended in FEASIBILITY_AND_ESTIMATE.md §7 — pair → PLAY_SOUND → ACK → audit — before any other module.

## 2026-08-24 — vertical slice built, 2/3 pieces verified

- `relay-server/`: pairing (PIN + HMAC session token), PLAY_SOUND routing, audit log. Verified with
  `test_vertical_slice.js` (automated) — happy path + rejected wrong PIN + rejected forged token.
  Found and fixed a real bug during testing: agent couldn't authenticate before a controller claimed
  the pairing code (secret was only stored on `PAIR_REQUEST`, not `PAIR_INIT`).
- `controller/`: static-page web UI (plain HTML/JS, not Next.js — see inline note in
  `controller/server.js` for why). Verified live in-browser: entered a real pairing code, pressed
  Push to Sound, watched the audit log update in real time against the running relay.
- `android-agent/`: full Kotlin/Gradle project written (pairing UI, OkHttp WebSocket client,
  MediaPlayer sound playback, matches PROTOCOL.md). **Not yet compiled** — this machine's Java/Gradle
  cannot open its internal loopback IPC socket (`Unable to establish loopback connection`,
  `UnixDomainSockets.connect` → `Invalid argument`). Confirmed this is not a code issue: reproduced
  identically across 3 JDK builds (17.0.8, 17.0.13, 21.0.5), 2 process-spawning tools (Bash and
  PowerShell), and with the calling tool's own sandbox explicitly disabled — the restriction persists
  regardless, so it's specific to how this automated session spawns processes, not the project or the
  physical machine in general. `android-agent/build.bat` has everything wired up (JDK/SDK/Gradle
  already downloaded to `C:\Android`) for the operator to run directly in their own terminal, where it
  should build normally.
- `relay-server/fake_agent.js`: stand-in agent for testing the controller without a phone.

## 2026-08-24 — controller re-verified with Reticle; Android APK actually compiled

- Re-verified the controller UI using Reticle (`reticle_act_and_wait` / `reticle_assert`), not just
  manual browser driving: filled a real pairing code, clicked Pair, confirmed the PAIR_COMPLETE audit
  entry for the fresh device id, clicked Push to Sound, asserted `"device result: PLAYED"` — passed.
  Filed one gap report with Reticle (net.bodyContains couldn't read the body without
  `captureNetworkBodies`, had to fall back to a text-presence assert).
- Got a real Android APK compiled despite the blocked Gradle build: `android-agent/manual-build/`
  drives aapt2 + javac + d8 + apksigner directly (none of these need Gradle's daemon IPC socket).
  Along the way: found build-tools 34.0.0's bundled d8 (8.2.2-dev) throws an internal NPE on some
  class shapes from javac 21 output regardless of anonymous-class nesting depth — installing
  build-tools 35.0.0 (newer d8) fixed it. Output: signed, `apksigner verify`-clean APK at
  `android-agent/manual-build/out/apk/app-debug.apk`. This path uses a hand-rolled `MiniWebSocket`
  (no OkHttp/Kotlin-stdlib, to avoid manual dependency-jar fetching) — it exists only to prove the
  design compiles and runs; `android-agent/app/` (Kotlin + OkHttp, via Gradle) stays the real
  implementation.
- Next: get an emulator running to actually install and tap through the APK (system image
  downloading); no physical phone available in this session.

## 2026-08-25 — full module suite: control plane built + verified

Scope expanded (operator request): mic, camera, location, screen, lock, remote touch+keyboard.
CTO scope call recorded honestly:
- **Doable, honest Android paths:** location, device info, remote touch/keyboard (AccessibilityService),
  lock (DevicePolicyManager), sound. Screen (MediaProjection) + mic/camera (foreground service +
  runtime permission) are the next, heavier phase.
- **Android HARD-blocks (NOT built, cannot be, by design):** remote *unlock* — no API lets a
  third-party app dismiss the keyguard / enter the user's credential. Offering it would require a
  credential bypass, forbidden by MASTER.md §17/§50. Lock is shipped; unlock is not.

Built this session:
- Android agent (`app/`) is now multi-module: `Agent.kt` (singleton relay conn + message router),
  `HrappApplication.kt`, `RemoteControlService.kt` (AccessibilityService: tap/swipe/global-nav/text,
  normalized 0..1 coords scaled to real screen), `LockAdminReceiver.kt` (DeviceAdminReceiver +
  lockNow), `DeviceInfoModule`, `LocationModule`, `SoundModule`. Manifest wired with the
  accessibility service, device-admin receiver, res/xml configs, permissions. MainActivity is now a
  thin UI over Agent that walks the user through the hand-granted permissions. **Not compiled this
  session** (Gradle still blocked); builds via `build.bat`.
- Relay (`server.js`) generalized to a two-table router (TO_AGENT commands / TO_CONTROLLER
  responses) so new modules are additive — no per-message case. Original vertical-slice test still
  passes (regression clean).
- Controller (`public/`) is now a full dashboard: capability chips, device-info card, location card
  with map link, remote-control touchpad (Pointer Events → tap/swipe) + nav buttons + text input,
  Push-to-Sound + Lock actions, live audit log.
- **Verification:** `test_modules.js` (automated) passes for capabilities/device-info/location/
  input/lock/audit. Then re-verified the whole dashboard **live in-browser with Reticle** against a
  full-protocol fake agent — every module round trip proved (verified:"yes"): pairing, device info
  (Pixel 5/82%/wifi/41GB), location (24.86/67.00 ±13m), lock ("device locked"), remote input
  (Back → global ok), each with a matching audit entry.
- Still user-only (no hardware here): compiling the full-module APK (build.bat) and confirming the
  gestures/lock actually fire on a real phone.

## 2026-08-25 — media streams: screen + camera + mic (monitor side verified)

Added the three media modules the operator asked for.
- **Android agent (`app/`):** `MicModule` (AudioRecord → 8kHz PCM chunks), `ScreenCaptureModule` +
  `MediaProjectionActivity` (per-session consent, Android-14-correct) + `ScreenCaptureService`
  (mediaProjection foreground service, VirtualDisplay → ImageReader → ~3fps JPEG),
  `CameraModule` (Camera2 → ~2fps JPEG). Agent router + capability report extended; manifest gets
  RECORD_AUDIO/CAMERA/FOREGROUND_SERVICE_MEDIA_PROJECTION perms, the service + consent activity, and
  MainActivity a "Allow mic + camera" button. **Not compiled here** (Gradle still blocked) — real
  capture only runs on a device anyway; builds via `build.bat`.
- **Relay:** stream message types added to the router; high-rate frames (`SCREEN_FRAME`/
  `CAMERA_FRAME`/`MIC_CHUNK`) are forwarded but excluded from the audit log so it isn't flooded —
  only `STREAM_STATUS` start/stop is audited.
- **Controller:** screen + camera video panels (`<img>` fed base64 frames), mic level meter + WebAudio
  playback, start/stop buttons, capability chips for all three.
- **Verification (monitor side, what runs here):** `test_streaming.js` automated (frames delivered,
  stop halts them, audit not flooded) + all prior suites still green. Then driven **live in-browser
  with Reticle**: paired, started each stream, watched frame/chunk counters climb continuously
  (screen 139, camera 125, mic 227), confirmed STOP halts frames and the audit shows clean
  STREAM_STATUS lines. Monitor pipeline for all three media types proven end to end.
- **What's genuinely unverified (needs the operator's phone):** the *capture* side — MediaProjection
  consent, AudioRecord, Camera2 actually producing frames on hardware. Code is written correctly to
  the platform APIs but cannot run in this sandbox (no device, no emulator accel, Gradle blocked).

Honest scope reminder carried forward: **remote unlock is not built and cannot be** — no Android API
exists for it. Lock only.
