# HRAPP Requirements Traceability Matrix

**Legend:**
- PASS — real-device or relay-verified evidence exists
- PASS(relay) — verified against running relay with automated test; real-device NOT yet verified
- DESIGN-VERIFIED — logic confirmed correct by code analysis; not yet device-tested
- NOT VERIFIED — code exists, no test run
- BLOCKED — physically/platform impossible; documented
- FAIL — defect confirmed

Last updated: 2026-09-28

---

## NET — Network / Relay

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| NET-001 | Remove Wi-Fi IP dependency — WSS + stable relay domain | `parseTarget()` in Agent.kt:106 | Manual: relay running on LAN IP | LAN connectivity verified in prior sessions | PASS(relay) | Public WSS relay not deployed — user must deploy Railway/Cloudflare Tunnel |
| NET-002 | Stable DEVICE_ID survives restarts/updates | `stableDeviceId()` Agent.kt:190 + SharedPreferences `agent_config` | test_reconnect.js | Relay test PASS; POCO X7 reconnect NOT VERIFIED | PASS(relay) / NOT VERIFIED device | POCO X7 reboot/update test pending TASK-01 |
| NET-003 | Global connectivity (phone works on any network) | `parseTarget()` accepts `wss://` schema | n/a — deployment gate | No public relay deployed yet | NOT VERIFIED | Requires Railway/Cloudflare Tunnel deployment by user |

---

## PAIR — Pairing

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| PAIR-001 | Pairing code on first open | `sendPairInit()` Agent.kt:200 + relay `PAIR_INIT` handler | test_vertical_slice.js | Code issued in automated test | PASS(relay) | Code display on real phone NOT VERIFIED |
| PAIR-002 | Pairing code valid ≥ 10 minutes | relay server.js: `expiresAt: Date.now() + 10*60_000` | Code review | 10-min expiry set in relay; not tested with clock | DESIGN-VERIFIED | Real expiry test NOT VERIFIED |
| PAIR-003 | Permanent pairing (survives restart) | `paired-devices.json` + `agent_config` SharedPrefs | test_reconnect.js | Relay test: PASS; POCO X7 reboot: NOT VERIFIED | PASS(relay) / NOT VERIFIED device | C1–C5 in TASK01 checklist |
| PAIR-004 | Formal state machine | `ConnectionState` enum Agent.kt:12 + `transition()` | test_vertical_slice.js | State transitions logged in relay test | PASS(relay) | Device state transitions NOT VERIFIED |
| PAIR-005 | No reconnect storms | `scheduleReconnect(gen)` with gen guard Agent.kt:67 | test_reconnect.js | Old gen ignored, single reconnect per gen | PASS(relay) | Backoff timing NOT VERIFIED on device |
| PAIR-006 | ConnectionState.PAIRED transition | Agent.kt state machine | Code review | AUTHENTICATED set on AUTH_OK; PAIRED never set (controller-side pairing command not implemented) | FAIL | `PAIRED` state requires controller to send explicit PAIR_COMPLETE command; currently stays AUTHENTICATED |

---

## SETUP — One-time setup

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| SETUP-001 | T&C acceptance on first run | `showTermsDialog()` MainActivity.kt:54 | Code review + logic analysis | `needsTerms()` = `termsVersion < CURRENT_TERMS_VERSION` (0 < 1 = true for fresh install) | DESIGN-VERIFIED | NOT VERIFIED on device — TASK-01 gate |
| SETUP-002 | Setup survives APK update | SharedPreferences `hrapp_setup` persist through APK update | Logic analysis | Stored `termsVersion=1`, `CURRENT_TERMS_VERSION=1` → `needsTerms()=false` on update | DESIGN-VERIFIED | NOT VERIFIED on device |
| SETUP-003 | Reinstall starts fresh | Android wipes SharedPreferences on uninstall | Platform guarantee | Standard Android behavior | PASS(platform) | No special code needed |
| SETUP-004 | Terms re-consent when version changes | `CURRENT_TERMS_VERSION` int in SetupManager.kt:15 | Code review | Bumping to 2 while stored=1 triggers re-prompt | DESIGN-VERIFIED | Intentional re-consent not device-tested |

---

## STREAM — Media streaming

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| STREAM-001 | Camera stream | CameraModule.kt + Camera2 API | test_streaming.js (relay) | Frames relayed in automated test; capture side NOT VERIFIED | PASS(relay) | Real camera on POCO X7 NOT VERIFIED |
| STREAM-002 | Mic stream | MicModule.kt + AudioRecord | test_streaming.js | PCM chunks relayed; capture NOT VERIFIED | PASS(relay) | Real mic on POCO X7 NOT VERIFIED |
| STREAM-003 | Screen capture | ScreenCaptureService.kt + MediaProjection | test_streaming.js | Frames relayed; MediaProjection consent NOT VERIFIED | PASS(relay) | MediaProjection consent dialog on device NOT VERIFIED |
| STREAM-004 | Location | LocationModule.kt + FusedLocation | test_modules.js | Location event relayed; real GPS NOT VERIFIED | PASS(relay) | Real GPS on POCO X7 NOT VERIFIED |
| STREAM-005 | Simultaneous streams | StreamSessionManager.kt | Not tested simultaneously | Each stream tested independently in relay | NOT VERIFIED | Simultaneous camera+mic+screen NOT VERIFIED on device |
| STREAM-006 | Backpressure / drop-oldest | BoundedFrameQueue.kt (camera=3, mic=10) | Code review | Drop-oldest logic implemented; queue depth NOT measured under load | DESIGN-VERIFIED | Real frame drop behavior NOT VERIFIED |
| STREAM-007 | Stream failure isolation | StreamSessionManager.kt try/catch per stream | Code review | Exception isolation in code; cross-stream failure NOT tested | DESIGN-VERIFIED | Failure isolation NOT VERIFIED |
| STREAM-008 | H.264 encoding | NOT IMPLEMENTED | n/a | Currently JPEG ~2fps from Camera2 JPEG surface | NOT IMPLEMENTED | H.264 requires MediaCodec surface encoder; separate work item |

---

## PERF — Performance

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| PERF-001 | 500 GB/s throughput | bench_throughput.js | bench_throughput.js | Measured: **41.6 MB/s (333 Mbps)** localhost; 500 GB/s physically impossible | BLOCKED | Physics (network bandwidth); actual POCO X7 throughput NOT MEASURED |
| PERF-002 | 30-min soak test | All streaming modules | NOT RUN | No soak test data | NOT VERIFIED | CPU/RAM/thermal/FPS/latency/drops NOT measured |
| PERF-003 | Real camera resolution/bitrate | CameraModule.kt | NOT RUN on device | JPEG quality 80, ~2fps, resolution depends on device | NOT VERIFIED | Must measure on POCO X7 |

---

## SEC — Security

| ID | Requirement | Module/Code | Test performed | Evidence | Status | Remaining risk |
|----|-------------|-------------|----------------|----------|--------|----------------|
| SEC-001 | Rate limiting | `ipAllowed()` relay server.js | Code review | 20 conn/60s per IP implemented | DESIGN-VERIFIED | Not load-tested |
| SEC-002 | Pairing brute-force guard | relay: wrong-code rejection | test_authz.js | Brute force rejected in automated test | PASS(relay) | |
| SEC-003 | Auth before commands | relay: `isAuthenticated()` check | test_authz.js | Unauthenticated commands rejected (AUTH_ERROR) | PASS(relay) | |
| SEC-004 | No covert surveillance | Visible app, T&C dialog, no icon hiding | Code review + T&C text | App always visible; no stealth mode in codebase | PASS | Policy enforced by design |
| SEC-005 | No Play Protect bypass | Only official Android APIs | Code review | No reflection, no bypass code | PASS | |
| SEC-006 | Cleartext only for LAN dev | `android:usesCleartextTraffic="true"` + comment in Manifest | Code review | Noted as temporary; requires wss:// for production | NOT VERIFIED for prod | Must remove once public relay uses TLS |
| SEC-007 | Vercel token exposure | n/a | git log + grep | Token NOT found in git history or working tree | PASS | User must revoke the Vercel token that was pasted in chat — go to vercel.com/account/tokens |
| SEC-008 | Android Keystore signing | `hrapp-release.keystore` | apksigner verify | SIGNATURE OK on every build | PASS | Key password is `android` — weak, acceptable for dev-only sideload |

---

## NET-MATRIX — Network failure matrix

| Scenario | Expected behavior | Status |
|----------|-------------------|--------|
| Wi-Fi loss | `onClosed` → `scheduleReconnect` → retry with backoff | NOT VERIFIED on device |
| Wi-Fi recovery | Reconnect within `retryDelayMs` after next interval | NOT VERIFIED on device |
| Mobile-data transition | Same as Wi-Fi loss (socket closes, agent retries) | NOT VERIFIED |
| Relay restart | Relay loads `paired-devices.json`; agent re-auths with stored device_id | PASS(relay) / NOT VERIFIED device |
| Relay crash (unclean) | Agent `onFailure` fires; backoff reconnect | NOT VERIFIED |
| Phone reboot | BootReceiver starts ConnectionService; re-auth | NOT VERIFIED |

---

## Summary by gate

| Gate | Status |
|------|--------|
| TASK-01 POCO X7 real-device base (B1/B2) | **OPEN — waiting for user to install v12** |
| Persistent pairing (C1–C5) | NOT VERIFIED |
| T&C onboarding on device | NOT VERIFIED |
| Exponential backoff real timing | NOT VERIFIED |
| Camera/mic/screen on device | NOT VERIFIED |
| Location on device | NOT VERIFIED |
| Simultaneous streams | NOT VERIFIED |
| H.264 encoding | NOT IMPLEMENTED |
| Public WSS relay deployed | NOT VERIFIED — user action required |
| 30-min soak test | NOT VERIFIED |
| PAIR-006 (PAIRED state) | **FAIL — needs controller-side PAIR_COMPLETE** |
| Security (relay hardening) | PASS(relay) |
| T&C logic (update preservation) | DESIGN-VERIFIED |
