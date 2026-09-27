# HRAPP — Final Requirements Matrix
*Last updated: 2026-09-28 | versionCode 10*

Statuses: **PASS** = implemented + tested + evidence exists | **FAIL** = tested and failed | **BLOCKED** = external/platform limit | **NOT VERIFIED** = needs real device

---

## A. Device Identity

| ID | Requirement | Implementation | Source File | Test | Evidence | Status | Limitation |
|----|-------------|---------------|-------------|------|---------|--------|-----------|
| NET-001 | No same-Wi-Fi dependency | WSS-ready parseTarget() accepts wss:// URLs | Agent.kt:85 | test_reconnect.js | PASS on JVM | NOT VERIFIED (device) | LAN default until Cloudflare Tunnel wired |
| NET-002 | Stable DEVICE_ID across restarts/updates | UUID in SharedPrefs `device_id` key | Agent.kt:158 | test_reconnect.js | reconnect keeps same ID — PASS | NOT VERIFIED (device update test) | Wiped on uninstall (by design) |
| NET-003 | Global connectivity via relay | parseTarget() handles wss://domain:443 | Agent.kt:83 | bench_throughput.js | 41.6 MB/s localhost — PASS | NOT VERIFIED (internet relay) | Requires Cloudflare Tunnel or VPS deploy |
| NET-004 | IP display shows host:port + exception type | status("relay unreachable ($host:$port) — ${t.javaClass.simpleName}") | Agent.kt:125 | — | Code visible | NOT VERIFIED (device) | — |

## B. Pairing Code

| ID | Requirement | Implementation | Source File | Test | Evidence | Status | Limitation |
|----|-------------|---------------|-------------|------|---------|--------|-----------|
| PAIR-001 | First-open pairing code displayed | PAIR_INIT→PAIR_INIT_RESPONSE→UI | Agent.kt:204 | test_vertical_slice.js | PASS JVM; code 347513 POCO X7 v6 | PARTIAL (v10 not device-tested) | — |
| PAIR-002 | ≥10 min code validity | expiresAt: Date.now() + 10 * 60_000 | server.js:195 | test_pairing_bruteforce.js | PASS JVM | NOT VERIFIED (device) | — |
| PAIR-003 | Cryptographically secure code | crypto.randomInt(100000, 1000000) | server.js:186 | test_pairing_bruteforce.js | PASS | PASS | — |
| PAIR-004 | Brute-force protection | MAX_PAIR_ATTEMPTS=5 per socket | server.js:14 | test_pairing_bruteforce.js | BRUTE-FORCE CHECK PASSED | PASS | — |
| PAIR-005 | Code survives UI lifecycle race | lastPairingCode retained, re-delivered on setStatusListener | Agent.kt:63 | — | Code visible | NOT VERIFIED (device) | — |
| PAIR-006 | Formal pairing state machine | ConnectionState enum + transition() | Agent.kt (enum) | — | State logged on every transition | NOT VERIFIED (device) | — |

## C. Permanent Pairing

| ID | Requirement | Implementation | Source File | Test | Evidence | Status | Limitation |
|----|-------------|---------------|-------------|------|---------|--------|-----------|
| PPAIR-001 | Pairing persists across relay restart | paired-devices.json loaded on startup | server.js:133 | test_reconnect.js | RECONNECT CHECK PASSED | PASS | — |
| PPAIR-002 | Pairing persists across app restart | device_id in SharedPrefs + relay re-auth | Agent.kt:105 | test_reconnect.js | PASS JVM | NOT VERIFIED (device) | — |
| PPAIR-003 | No duplicate sockets / reconnect storm | connectGen guard; old ws closed after reassignment | Agent.kt:96-138 | — | v6 112→stable | NOT VERIFIED (v10 device) | — |
| PPAIR-004 | Exponential backoff reconnect | 5s fixed (not exponential yet) | Agent.kt:127 | — | — | NOT VERIFIED | Upgrade to exponential in Phase G |
| PPAIR-005 | Stale callback isolation | gen != connectGen guard in onMessage/onFailure/onClosed | Agent.kt:119-134 | — | Code visible | NOT VERIFIED (device) | — |

## D. First-Install Setup

| ID | Requirement | Implementation | Source File | Test | Evidence | Status | Limitation |
|----|-------------|---------------|-------------|------|---------|--------|-----------|
| SETUP-001 | One-time setup state machine | SetupManager enum FRESH→COMPLETE | SetupManager.kt | — | Code visible | NOT VERIFIED (device) | MainActivity not wired to SetupManager yet |
| SETUP-002 | T&C persistence with version | terms_version + accepted_at in SharedPrefs | SetupManager.kt:44 | — | Code visible | NOT VERIFIED (device) | — |
| SETUP-003 | Permission state checked each launch | requestPermissions() on each onCreate | MainActivity.kt:47 | — | Code visible | NOT VERIFIED (device) | Android controls grant state |
| SETUP-004 | Setup not repeated after update | SharedPrefs `stage=COMPLETE` survives update | SetupManager.kt | — | NOT TESTED | NOT VERIFIED | Needs real update test |
| SETUP-005 | DEVICE_ID survives update | same keystore = same app, SharedPrefs kept | Agent.kt:158 | — | Design: correct | NOT VERIFIED | Needs real update test |

## E. Streaming Architecture

| ID | Requirement | Implementation | Source File | Test | Evidence | Status | Limitation |
|----|-------------|---------------|-------------|------|---------|--------|-----------|
| STREAM-001 | Simultaneous streams | StreamSessionManager independent lifecycle per stream | StreamSessionManager.kt | — | Code visible | NOT VERIFIED (device) | — |
| STREAM-002 | Stream failure isolation | try/catch in startCamera/startMic; FAILED state isolated | StreamSessionManager.kt:31 | — | Code visible | NOT VERIFIED (device) | — |
| STREAM-003 | Backpressure — bounded queues | BoundedFrameQueue: camera=3, mic=10, drop-oldest | BoundedFrameQueue.kt | — | Code visible | NOT VERIFIED (device) | — |
| STREAM-004 | Camera functional | Camera2 JPEG ~2fps via ImageReader | CameraModule.kt | — | Code exists | NOT VERIFIED (device) | Relay crash fixed in v8 |
| STREAM-005 | Microphone functional | AudioRecord 8kHz PCM → base64 | MicModule.kt | — | Code exists | NOT VERIFIED (device) | — |
| STREAM-006 | Screen capture functional | MediaProjection + virtual display | ScreenCaptureModule.kt | — | Code exists | NOT VERIFIED (device) | Requires user MediaProjection consent |
| STREAM-007 | Location functional | LocationModule → relay | LocationModule.kt | test_modules.js | PASS JVM | NOT VERIFIED (device) | GPS/permission dependent |
| STREAM-008 | 1080p video | JPEG smallest-size currently; H.264 MediaCodec pending | CameraModule.kt:60 | — | — | NOT VERIFIED | H.264 MediaCodec = Phase J upgrade |

## F. Performance

| ID | Requirement | Stated Target | Measured | Bottleneck | Status |
|----|-------------|--------------|---------|-----------|--------|
| PERF-001 | Throughput 500 GB/s | 500 MB/ms | **41.6 MB/s (333 Mbps) localhost** | Node.js single-thread + WS framing | **BLOCKED — PHYSICS** |
| PERF-002 | Cellular 50 GB/s | 50 MB/ms | ~1–12 MB/s typical LTE | Carrier RF + CGNAT | **BLOCKED — NETWORK** |
| PERF-003 | Wi-Fi actual throughput | — | ~20–100 MB/s expected | Phone RF uplink | NOT VERIFIED (device) |
| PERF-004 | 1080p @ 25fps | 1920×1080/25fps | Currently 2fps JPEG | MediaCodec H.264 needed | NOT VERIFIED |

*Performance reality: 500 GB/s = physically impossible on any consumer device or network. Closest achievable is ~100 MB/s on Wi-Fi 6.*

## G. Security

| ID | Requirement | Implementation | Status |
|----|-------------|---------------|--------|
| SEC-001 | Authenticated commands only | boundRole+boundDeviceId check before TO_AGENT routing | PASS (test_authz.js) |
| SEC-002 | Brute-force rate limiting | MAX_PAIR_ATTEMPTS=5 per socket | PASS (test_pairing_bruteforce.js) |
| SEC-003 | IP-level connection rate limiting | ipAllowed(): 20 conns/60s per IP | PASS (code) |
| SEC-004 | Session token for controller | HMAC-SHA256 nonce.sig | PASS (test_vertical_slice.js) |
| SEC-005 | No production secrets in Git | .gitignore covers keystore; no API keys found | PASS (audit) |
| SEC-006 | WSS/TLS in production | cleartext ws:// for LAN; wss:// accepted by parseTarget | NOT VERIFIED (needs Tunnel deploy) |
| SEC-007 | Android Keystore for DEVICE_ID | SharedPrefs plain text currently | NOT VERIFIED — upgrade to Keystore |
| SEC-008 | Sensitive data not logged | code not logged in production paths; secret not exposed | PASS (code audit) |

## H. Network Matrix

| Phone | Controller | Architecture | Status |
|-------|-----------|-------------|--------|
| Wi-Fi LAN | Wi-Fi LAN | ws:// direct | NOT VERIFIED (device) |
| Wi-Fi | Remote (internet) | wss:// Cloudflare Tunnel | NOT VERIFIED (tunnel not deployed) |
| 5G/LTE | Remote | wss:// relay | NOT VERIFIED (no internet relay) |
| Cellular | Wi-Fi | wss:// relay | NOT VERIFIED |

## I. Build Status

| Item | Value |
|------|-------|
| APK versionCode | 10 |
| APK versionName | 1.10 |
| Build result | PASS (kotlinc + d8 + zipalign + apksigner) |
| Signature | PASS (hrapp-release.keystore, androiddebugkey) |
| Keystore committed to Git | NO (in .gitignore) |
| APK available at relay | PASS — http://192.168.0.246:8787/hrapp-remote.apk |

## J. Real Device (POCO X7)

| Test | Version | Result | Evidence |
|------|---------|--------|---------|
| Pairing code displayed | v6 | PASS | Code 347513, 2026-09-23T18:21:41 |
| AUTH_OK stable | v6 | PASS | No disconnect loop |
| AUTH_OK stable | v7/v8 | NOT VERIFIED | Not installed |
| AUTH_OK stable | v9/v10 | WAITING | Install in progress |
| Camera frame → relay | v8+ | NOT VERIFIED | Waiting for device |
| Mic stream | v8+ | NOT VERIFIED | — |
| Screen capture | v8+ | NOT VERIFIED | — |
| Location | v8+ | NOT VERIFIED | — |
| Long-run soak | — | NOT VERIFIED | — |

---

*TASK-01 device gate: WAITING — user installing v10 APK on POCO X7*
