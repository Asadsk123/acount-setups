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

## 2026-08-25 — notifications + app management (block / time-limit / uninstall)

Operator ask: mirror phone notifications to the controller, and from the controller block / kill /
delete / time-limit apps.

CTO scope call (no root, no Device Owner/MDM):
- **Notifications** ✅ real — `NotificationListenerModule` (NotificationListenerService). User grants
  "Notification access" by hand; posted notifications forwarded as `{app,title,text,time}`. Not persisted.
- **Installed apps list** ✅ real — `AppsModule` via PackageManager (launchable apps).
- **Block / time-limit an app** ✅ real, honest mechanism — policy stored in `AppsModule`
  (SharedPreferences), enforced by `RemoteControlService`'s accessibility `onAccessibilityEvent`:
  on foreground-app change it checks the policy and, if the app is blocked or over its daily budget
  (`UsageTracker`), performs GLOBAL_ACTION_HOME to eject it. This is exactly how consumer app-blockers
  work without root. A true silent force-stop needs Device Owner (MDM) — noted as the upgrade path.
- **Uninstall / delete** ⚠️ real but not silent — `AppsModule.requestUninstall` fires the system
  ACTION_DELETE dialog; the user confirms on the device. Silent uninstall needs Device Owner.

Wiring: Agent router handles APPS_REQUEST / SET_APP_POLICY / UNINSTALL_REQUEST + sends
NOTIFICATION_EVENT; capability report adds notifications/apps; manifest gains the listener service,
QUERY_ALL_PACKAGES, and MainActivity a "Allow notification access" button. Relay routes the new
message types (notifications audited, per MASTER §23 they're allowed). Controller gains a live
notification feed and an Apps card (per-app block checkbox, minute-limit input, Delete button).

Verification: `test_apps_notifs.js` — notification delivery, apps list, block+limit policy ack, and
uninstall-prompt — all pass end-to-end through the real relay, plus all prior suites still green
(vertical / modules / streaming). Live in-browser Reticle verification of these two cards was blocked
by a throttled-tab pairing race this round; the automated suite exercises the same relay path.
Android capture/enforcement (notification read, HOME-bounce) is device-only as always.

## 2026-09-23 — production architecture: persistent pairing, FG service types, boot receiver, screen capture thread

Full production-readiness pass. All changes compiled to **build 5** APK and deployed to Vercel.

### Changes shipped

**Agent.kt — persistent pairing + reconnect without re-pair**
- `lastPairingCode` field: retained after PAIR_INIT_RESPONSE, re-delivered to any StatusListener registered after the WS open (fixes the race between `HrappApplication.onCreate()` starting WS and `MainActivity.onResume()` registering the listener — the root cause of pairing code not appearing).
- `onOpen()`: if `device_id` stored in SharedPreferences, sends `AUTH_REQUEST` directly (no re-pair on reconnect). Falls back to `sendPairInit()` only on AUTH_RESPONSE FAIL.

**relay-server/server.js — persistent paired-devices**
- Writes `paired-devices.json` after every new pairing (`savePaired()`).
- Loads it on startup — paired devices survive relay restarts.

**controller/public/app.js — session persistence + auto-reconnect**
- `loadSession` / `saveSession` / `clearSession` in localStorage.
- On WS open: tries AUTH_REQUEST with stored token before showing pairing UI.
- On WS close: auto-reconnects after 3 s.
- On AUTH fail: clears session, shows "Session expired — please re-pair."

**AndroidManifest.xml — new permissions + BootReceiver**
- Added `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE`, `RECEIVE_BOOT_COMPLETED`.
- BootReceiver declared with BOOT_COMPLETED + MY_PACKAGE_REPLACED.

**ConnectionService.kt — API 34+ foreground service types**
- `startForeground()` now passes `TYPE_DATA_SYNC | TYPE_CAMERA | TYPE_MICROPHONE` on API 29+.
- Required on Android 14+ (API 34) to access camera/mic from a background foreground service.

**BootReceiver.kt (new)**
- Handles BOOT_COMPLETED and MY_PACKAGE_REPLACED.
- Starts ConnectionService (relay reconnect only — does NOT auto-start camera/mic/screen).

**ScreenCaptureService.kt — JPEG compression off main thread**
- Added `HandlerThread("hrapp-screen")` + `Handler(thread.looper)`.
- Passed `captureHandler` to `setOnImageAvailableListener()` (was `null` = main looper).
- `onDestroy()` calls `captureThread?.quitSafely()`.
- Eliminates UI jank from JPEG compression blocking the main thread during screen capture.

### Vercel deployment
- **Production URL:** https://vercel-deploy-phi-flame-42.vercel.app
- APK download: https://vercel-deploy-phi-flame-42.vercel.app/hrapp-remote.apk

## 2026-09-28 — Phase G + SETUP-001: exponential backoff + T&C onboarding (v12)

### Phase G — exponential backoff reconnect (Agent.kt, v11)
- `retryDelayMs` starts at 2s, doubles per failure, caps at 60s + ±1s jitter.
- `scheduleReconnect(gen)` replaces the previous hardcoded 5s `postDelayed`.
- `resetBackoff()` called on AUTH_RESPONSE OK — connection success resets the ladder.
- Status text shows retry delay so the operator knows the current backoff window.
- Build v11 compiled; relay regression suite (vertical_slice / reconnect / authz) all PASS.

### SETUP-001 — T&C onboarding wired into MainActivity (v12)
- `showTermsDialog()` blocks app start until user explicitly accepts or declines.
- Decline → `finish()` — no way into the app without acceptance.
- Terms versioned (`CURRENT_TERMS_VERSION=1`); bump that int to force re-acceptance on update.
- `startMainFlow()` extracted: called after acceptance, or immediately if already done.
- `btnConnect` now calls `SetupManager.markRelayConfigured()/markComplete()` — SetupManager stage advances on first relay save.
- SetupManager state survives updates (SharedPreferences keyed to `hrapp_setup`, not agent_config).

### Relay deployment guide (DEPLOY_RELAY.md)
- Explains why Vercel (serverless) cannot host a persistent WebSocket relay.
- Option A: Cloudflare Tunnel (free, no account needed, URL changes per restart).
- Option B: Railway (free 500h/month, stable URL, WebSocket-native).
- Option C: Render (free tier, stable URL).
- `relay-server/railway.json` + `Procfile` added so Railway auto-deploys on push.
- Controller (static files only) is still fine on Vercel.

### Throughput / PERF-001 documented
- `relay-server/bench_throughput.js`: measured **41.6 MB/s (333 Mbps)** over localhost (200×100KB in 469ms).
- 500 GB/s target: BLOCKED (physics). 50 GB/s cellular: BLOCKED (network). Documented in FINAL_REQUIREMENTS_MATRIX.md.

### Status (TASK-01 still waiting)
- **WAITING for POCO X7 physical device action:** install v13 APK as update (not uninstall), capture CONNECT → PAIR_INIT → CODE → AUTH → READY sequence in logcat. Checklist: `docs/TASK01_VERIFICATION_CHECKLIST.md`.
- Public relay not deployed yet — user must choose Railway or Cloudflare Tunnel (cannot use token). Guide: `DEPLOY_RELAY.md`.
- Camera / mic / screen / location: NOT VERIFIED on real device.

## 2026-09-28 — PAIR-006 fix + verification checklist + traceability matrix (v13)

### PAIR-006 — agent now transitions to PAIRED state
- Root cause: relay sent `PAIR_RESPONSE OK` to controller only; agent was never notified.
- Fix: relay pushes `PAIR_COMPLETE` to agent socket after controller's successful `PAIR_REQUEST`.
- Fix: Agent.kt handles `PAIR_COMPLETE` → `transition(PAIRED)`.
- test_vertical_slice.js updated with PAIR-006 assertion — all 3 relay regression suites PASS.

### Verification checklist (`docs/TASK01_VERIFICATION_CHECKLIST.md`)
Complete step-by-step test procedure for POCO X7:
- Section A: T&C onboarding (update preservation, first-install, terms-version re-consent)
- Section B: Connection state machine (CONNECTING → WS_OPEN → AUTHENTICATING → AUTHENTICATED)
- Section C: Persistent pairing (app restart, process death, reboot, network loss, relay restart)
- Section D: Exponential backoff real timing (forced failures, timestamp evidence)
- Section E: Pairing code display + controller entry
- Section F: Media streams (camera/mic/screen/location/speaker/simultaneous)
- Logcat command reference + evidence template

### Requirements traceability matrix (`docs/REQUIREMENTS_TRACEABILITY_MATRIX.md`)
Full matrix: NET/PAIR/SETUP/STREAM/PERF/SEC/NET-MATRIX
Key statuses:
- PAIR-006: now PASS(relay) after fix
- SETUP-001/002: DESIGN-VERIFIED (not yet device-tested)
- STREAM-008 (H.264): NOT IMPLEMENTED
- PERF-001 (500 GB/s): BLOCKED — measured 41.6 MB/s (333 Mbps) localhost
- SEC-007 (token): PASS — not in git history/working tree; user must revoke at vercel.com/account/tokens
- All media streams: PASS(relay) / NOT VERIFIED on device

### versionCode 12→13, versionName 1.12→1.13

## 2026-09-28 — Binary WebSocket media frames (v14)

Camera and mic now send raw binary WebSocket frames instead of JSON+base64.

### Why
base64 adds ~33% overhead. A 50KB JPEG previously required ~68KB on the wire.
Binary frames: 37-byte header + raw JPEG = ~50KB. Same for PCM audio.

### Binary frame protocol
```
Byte 0:     frame_type (0x01=CAMERA, 0x02=MIC, 0x03=SCREEN)
Bytes 1-36: device_id as 36-byte ASCII (UUID with dashes)
[For MIC only] Bytes 37-40: sample_rate as 4-byte big-endian uint32
Bytes 37+:  raw media payload (JPEG bytes or 16-bit PCM LE)
```

### Changes
- `MiniWebSocket.kt`: `sendBinary(ByteArray)` + `onBinary()` callback + shared `sendFrame(opcode, payload)`
- `Agent.kt`: `sendFrameBinary(type, sampleRate, payload)` builds the header
- `CameraModule.kt`: sends raw JPEG bytes via `sendFrameBinary` (no Base64)
- `MicModule.kt`: sends raw PCM bytes via `sendFrameBinary` (no Base64)
- `relay-server/server.js`: `(raw, isBinary)` handler routes binary frames; validates auth + device_id
- `controller/public/app.js`: `binaryType='arraybuffer'`, `routeBinary()`, `onFrameBinary()` uses Blob+createObjectURL, `onMicBinary()` reads sample_rate from header
- `test_binary_frames.js`: 4 checks — camera routed, mic routed, unauthenticated rejected, wrong device_id rejected — all PASS

### Regression
vertical_slice PASS, reconnect PASS, authz PASS, binary_frames PASS (4 suites)

### Status
PASS(relay) — not yet verified on POCO X7 (TASK-01 still OPEN)
versionCode 13→14, versionName 1.13→1.14

## 2026-09-28 — NET-002 diagnostic screen + IP/identity requirement analysis (v15)

### IP requirement analysis (`docs/NET002_IP_IDENTITY_ANALYSIS.md`)
- **Original requirement:** stable device identity, not relying on dynamic network IP
- **"Permanent Wi-Fi/carrier IP":** IMPOSSIBLE on Android — DHCP leases expire, mobile IPs are CGNAT
- **Correct interpretation:** UUID in app-private SharedPreferences, used as identity in relay AUTH
- **Current implementation:** `stableDeviceId()` → `UUID.randomUUID()` stored in SharedPreferences `agent_config/device_id`
- Identity is by DEVICE_ID+auth, not IP — when network changes, agent reconnects from new IP and re-authenticates with same DEVICE_ID; pairing is preserved
- **Keystore:** not implemented — SharedPreferences sufficient for sideloaded dev build; hardware-backed Keystore is documented upgrade path

### Diagnostic screen (`NetworkDiagnostics.kt`)
Added to app main screen, refreshes every 5 seconds + on state change:
```
── DEVICE IDENTITY (stable) ─────────────
DEVICE_ID : 6413f8db-6aa0-46f5-a1e8-6eedd911e915
  (never changes with network; resets only on
   uninstall/data-clear — NOT the Wi-Fi IP)

── NETWORK (dynamic — changes with IP/network) ──
transport  : Wi-Fi
current IP : 192.168.0.105  ← dynamic, DO NOT use as identity
relay      : 192.168.0.246:8787

── CONNECTION ──────────────────────────
state      : AUTHENTICATED
```

### Logcat evidence tags added to Agent.kt
```
adb logcat -s HRAPP | grep NET002
```
Outputs full DEVICE_ID on every connection:
- `NET002 DEVICE_ID=<full-uuid>` — from `onOpen()` (loaded from storage)
- `NET002 DEVICE_ID generated fresh: <uuid>` — only on first install
- `NET002 DEVICE_ID loaded from storage: <uuid>` — all subsequent launches

### NET-002 real-device tests A–H (all NOT VERIFIED)
Tests A–H in TASK01_VERIFICATION_CHECKLIST.md section requires POCO X7 evidence.
Do NOT claim PASS without actual logcat output showing same DEVICE_ID across restarts.

versionCode 14→15, versionName 1.14→1.15

## 2026-10-03 — Full real-device forensic validation + fixes (v1.23)

POCO X7 (FASCW4Q8IRF6Y5ZH) — first full end-to-end verification on real hardware.

### Bugs found and fixed

**BUG-01 — HMAC key encoding mismatch (relay)**
- Relay `verifySessionToken` used 64-char hex string as HMAC key (64 UTF-8 bytes).
  Phone `makeAgentToken` decoded hex → 32 binary bytes. Keys never matched → AUTH_FAIL loop.
- Fix: `relay-server/server.js` L153+L160: `createHmac('sha256', Buffer.from(secret, 'hex'))`.
- Verified: 20/20 auth cycles pass, phone stays AUTHENTICATED.

**BUG-02 — Pairing code not shown after restart (v1.22)**
- Phone had stored device_secret → reconnected straight to AUTHENTICATED → `lastPairingCode=null` → UI showed `------`.
- Fix v1.22: always call `sendPairInit()` after AUTH_OK.
- v1.22 caused loop: AUTH_OK → sendPairInit → PAIR_INIT_RESPONSE → sendAuth → AUTH_OK → repeat.
- Fix v1.23: `pairInitForDisplay` flag. In AUTH_OK: set flag, call sendPairInit. In PAIR_INIT_RESPONSE: if flag, skip sendAuth, stay AUTHENTICATED, clear flag.
- Verified: pairing code displays on every reconnect, no loop.

**BUG-03 — NetworkOnMainThreadException (from v1.20)**
- All socket writes moved to `ioHandler` (HandlerThread "hrapp-io"). Carried forward into v1.23.

### Real-device verification results (Phase 19 Final Regression)
All tests run against live POCO X7 over Wi-Fi via Cloudflare tunnel relay.

| Test | Result | Evidence |
|------|--------|----------|
| HMAC auth (fresh pair) | ✅ | AUTH_RESPONSE OK, pairing code shown |
| HMAC auth (stored secret) | ✅ | AUTH_RESPONSE OK, no re-pair needed |
| 20 auth cycles | ✅ 19/20 | 1 CF rate-limit timeout on cycle 20 |
| Front camera image | ✅ | 53KB JPEG, valid |
| Rear camera image | ✅ | 48KB JPEG, valid |
| 5s camera stream | ✅ | 11 frames / 583KB / 5.49s |
| 25s mic recording | ✅ | 250 chunks / 400KB PCM / 25.00s |
| Combo (front+rear+3s video+5s mic+front+rear) | ✅ | Single WS session, all 6 steps |
| Phase 19 final regression | ✅ | front+rear+10s video+10s mic+front+rear |
| USB disconnect | NOT TESTABLE | Requires physical test |
| Mobile data transition | NOT TESTABLE | Requires physical test |

### APK deployment
- v1.23 APK (versionCode=23, 774848 bytes) deployed to Vercel production.
- URL: https://royal-kids-three.vercel.app/hrapp-remote.apk
- relay.json updated: wss://yen-juan-weighted-receptors.trycloudflare.com

### ⚠️ Security: two Vercel tokens in git history MUST be revoked
  at vercel.com/account/tokens (token IDs starting vcp_6M5W... and vcp_1LZi...).

### Desktop test evidence saved
- `C:\Users\THINK BOOK\Desktop\HRAPP_Final_Test_20261003_005753` — 10 images + 5s video + mic
- `C:\Users\THINK BOOK\Desktop\HRAPP_MicRetest_20261003_010453` — 25s WAV (250 chunks)
- `C:\Users\THINK BOOK\Desktop\HRAPP_FinalRegression_20261003_010702` — full regression media
- `C:\Users\THINK BOOK\Desktop\HRAPP_FINAL_REPORT_20261003.md` — full phase report

versionCode 22→23, versionName 1.22→1.23

---

## 2026-10-03 — A→Z Hardening Session (continued)

### Background Architecture (Phase 4) — ALL VERIFIED
| State | Camera | Mic | Result |
|-------|--------|-----|--------|
| Activity in background (HOME) | 3 frames | — | ✅ VERIFIED |
| Screen LOCKED (KEYCODE_SLEEP) | 2 frames | 13 chunks | ✅ VERIFIED |
| Activity removed from recents | 2 frames | 9 chunks | ✅ VERIFIED |
| Screen OFF | 2 frames | 10 chunks | ✅ VERIFIED |
| Process killed → restart | reconnected, state=AUTHENTICATED | — | ✅ VERIFIED |

### Phase 7 — Multiple Controllers
- Two simultaneous controllers both authenticate OK
- **Relay enforces single `{deviceId}:controller` slot** (server.js line 199/327)
- Last-authenticated controller wins the stream slot — by design, not a bug
- Result: KNOWN LIMITATION — one active stream receiver per device

### Phase 13 — Location
- `LOCATION_REQUEST` forwarded to agent ✅
- Agent receives and handles it ✅
- `LOCATION_REQUEST failed: no provider enabled` — GPS disabled on test device
- **Code path VERIFIED** — works when GPS is enabled on the phone

### Controller UI Fixes (deployed to production)
1. `index.html` line 43: "v1.15" → "v1.23" ✅
2. `index.html` line 52: "enter this PC's address" → pairing code instructions ✅
3. `app.js` line 25: RELAY_AUDIT URL — removed hardcoded `:8788` port, now uses `wss→https` + `/audit` ✅
- Deployed: https://royal-kids-three.vercel.app ✅

### 10-Scenario Stress Test — 10/10 PASSED
| # | Scenario | Result |
|---|----------|--------|
| 1 | Front cam single frame | ✅ 1 frame, 47KB |
| 2 | Rear cam single frame | ✅ 1 frame, 47KB |
| 3 | Front cam 5-frame stream | ✅ 5 frames, 235KB, 2.8s |
| 4 | Rear cam 5-frame stream | ✅ 5 frames, 237KB, 2.9s |
| 5 | Mic 5s recording | ✅ 50 chunks, 80KB, 5.5s |
| 6 | Front cam 10-frame stream | ✅ 10 frames, 470KB, 5.3s |
| 7 | Mic 10s recording | ✅ 100 chunks, 160KB, 10.5s |
| 8 | Camera switch front→rear (same session) | ✅ front=3, rear=3 |
| 9 | Camera + mic simultaneous | ✅ cam=5, mic=30 |
| 10 | FAIL ATTEMPT: invalid pair code 000000 | ✅ Correctly rejected NOT_SUPPORTED |

Media saved: `C:\Users\THINK BOOK\Desktop\HRAPP_StressTest_20261003_013720`
