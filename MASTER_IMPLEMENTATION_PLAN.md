# HRAPP — Master Implementation Plan
*Phase 0 Forensic + Plan Only — No code modified*
*Date: 2026-09-28*

---

## SECTION 1 — FORENSIC BASELINE

### Current Architecture (CONFIRMED BY SOURCE)

```
Android Agent (POCO X7)
      │  outbound ws:// (port 8787)
      ▼
Relay Server (Node.js, ws@8.18.0, port 8787/8788)
      │
      ▼
Web Controller (browser, static HTML/JS, port 3000)
```

**Current transport**: cleartext `ws://` only. No TLS. LAN-only in practice (user manually enters PC's `192.168.x.x` IP).

**Android package**: `com.hrapp.agent` (renamed to `com.hrapp.remote` at aapt2 link step)

**WebSocket client**: Hand-rolled `MiniWebSocket.kt` (RFC 6455 text frames, masked, no TLS, no fragmentation)

**Pairing**: 6-digit code (crypto.randomInt), 5-minute expiry, persisted in `paired-devices.json`

**Auth**: Agent authenticates by knowing `device_id` + `secret`. Controller uses HMAC session token from PAIR_RESPONSE.

**Current APK**: v8 (built, not yet installed on device)

### Current Failures (CONFIRMED BY RUNTIME — 2026-09-23/24)

| # | Failure | Status |
|---|---------|--------|
| RC-1 | Camera frame relay crash (Int.ushr 64-bit bug) | FIXED in v8 code, NOT device-verified |
| RC-2 | Double reconnect / socket storm | FIXED in v8 code, NOT device-verified |
| RC-3 | ConnectionService SecurityException crash loop (Android 14) | FIXED in v8 code, NOT device-verified |
| RC-4 | Relay no ws.on('error') handler | FIXED in v8 code, NOT device-verified |
| RC-5 | Socket leak v4/v5 | FIXED in v6, CONFIRMED on POCO X7 |

### Current Network Model

- Phone connects to relay via **manually entered LAN IP** (e.g., `192.168.0.246:8787`)
- Works ONLY when phone and PC are on same Wi-Fi
- IP saved to `SharedPreferences` — cleared on uninstall
- No TLS, no stable domain, no internet/remote support

### Current Pairing Model

- `PAIR_INIT` → relay issues 6-digit code + `device_id` + `secret`
- Phone shows code on screen, user types into controller
- Pairing persisted to `relay-server/paired-devices.json`
- Survives relay restart (loaded on startup)
- Does NOT survive relay being moved to different machine

### Current Setup Model

- No formal setup wizard
- User manually enters relay IP once
- Permissions requested at first launch (runtime request)
- No T&C, no terms persistence
- No update-state tracking

---

## SECTION 2 — REQUIREMENT CONFLICTS WITH PHYSICAL REALITY

**These must be documented before planning, per the mandate.**

### CONFLICT-1: STREAM-004 / SERVER-003 / SERVER-004 — Bandwidth Requirements

| Requirement | Stated Value | Physical Reality | Bottleneck |
|-------------|-------------|-----------------|------------|
| STREAM-004 | 500 MB/ms = **500 GB/s** | Wi-Fi 6 peak: ~1.2 GB/s. 5G mmWave peak: ~0.1 GB/s. 100GbE NIC: 12.5 GB/s. Single POCO X7 SoC memory bandwidth: ~50 GB/s internal. **No phone, Wi-Fi, or Internet connection can sustain 500 GB/s** | Physics / RF spectrum / silicon |
| SERVER-003 | 50 MB/ms = **50 GB/s** | Same. No consumer hardware reaches this. A single AWS 400GbE instance is 50 GB/s but the phone cannot feed it | Phone uplink |
| SERVER-004 | 500 MB/ms = **500 GB/s** | Even Google/AWS/Azure backbone segments max at 400Gbps = 50 GB/s | Global internet capacity |

**Engineering response** (per mandate — preserve requirement, document limitation, design toward maximum achievable):

- Requirement target: 500 GB/s (preserved)
- Maximum achievable on POCO X7 over Wi-Fi 6: ~500–800 Mbps (~62–100 MB/s)
- Maximum achievable over 5G: ~100–300 Mbps (~12–37 MB/s)
- Maximum achievable server-side (single relay, single NIC, 1GbE): ~125 MB/s
- Architecture toward target: binary WebSocket frames, H.265 hardware encoder, parallel relay cluster, CDN egress — but physical limit is the phone's RF uplink

**Will report**: REQUESTED 500 GB/s | ACHIEVED: ~100 MB/s max (Wi-Fi) | BOTTLENECK: Phone RF hardware

### CONFLICT-2: SERVER-001/002 — Cellular Without Internet

**Stated desire**: Phone communicates without internet / phone on cellular tower.

**Physical reality**: Normal Android cellular data = carrier NAT/CGNAT. Phone cannot receive inbound connections. Outbound WSS to a publicly addressable relay server IS the correct architecture. "Without internet" in the sense of no public Internet access means the relay must be on the same carrier's private APN, which requires carrier agreements. Consumer Android cannot bypass this.

**Engineering response**: Implement outbound WSS to a stable public domain (e.g., Cloudflare Tunnel or Railway/Render deployment). Phone works on any network as long as it has packet-data to the internet. True "no public internet" case requires private APN — document as out of scope for consumer deployment.

### CONFLICT-3: SETUP-003 — T&C Overriding Android Permissions

**Stated desire**: T&C acceptance persists permissions.

**Physical reality**: Android OS manages permissions independently of app T&C. App cannot prevent Android from revoking permissions. T&C can be persisted in SharedPrefs/DataStore; permissions must be re-checked on each launch regardless.

**Engineering response**: Persist T&C acceptance (version + timestamp). Check permissions on each launch separately. If permission revoked, prompt user — do not assume T&C acceptance means permission is valid.

---

## SECTION 3 — REQUIREMENTS LOCK (All IDs)

| ID | Requirement | Feasible As-Is | Needs Architecture Change |
|----|-------------|---------------|--------------------------|
| NET-001 | Remove Wi-Fi IP dependency | NO — currently requires LAN IP | YES — needs WSS + stable domain |
| NET-002 | Stable device identity | YES — UUID in SharedPrefs (done) | PARTIAL — needs Android Keystore for production |
| NET-003 | Global connectivity | NO — ws:// LAN only | YES — needs WSS to public relay |
| NET-004 | IP display clarity | NO — shows raw IP | YES — UI needs to distinguish identity vs network |
| PAIR-001 | First-open pair code | YES — works in v6+ | NO major change needed |
| PAIR-002 | 10-minute validity | PARTIAL — currently 5 min | MINOR — change to 10 min in relay |
| PAIR-003 | Pairing persists across restart | YES — paired-devices.json | YES for relay restart on different machine |
| PAIR-004 | Manual disconnect only | NO — any reconnect can reuse pairing | MINOR — implement explicit unpair command |
| PAIR-005 | No random pairing loss | PARTIAL — fixed in v6, RC-2/3 not device-verified | YES — v8 fixes need device verification |
| PAIR-006 | Formal state machine | NO — ad-hoc flags/callbacks | YES — implement ConnectionState enum |
| SETUP-001 | One-time setup | NO — no setup wizard | YES — implement setup flow |
| SETUP-002 | Permission state tracking | PARTIAL — requests on launch | YES — check actual state each launch |
| SETUP-003 | T&C persistence | NO — not implemented | YES — add T&C screen + persistence |
| SETUP-004 | Update preserves state | PARTIAL — same keystore = update preserves prefs | YES — verify experimentally |
| STREAM-001 | Simultaneous camera+mic+screen | PARTIAL — independent modules exist | YES — need coordinated session manager |
| STREAM-002 | Backpressure | NO — no bounded queues | YES — critical missing feature |
| STREAM-003 | 1080p video | PARTIAL — camera uses smallest resolution now | YES — implement H.264/H.265 MediaCodec |
| STREAM-004 | 500 GB/s | NOT POSSIBLE (physical limit) | Architecture toward max; report limit |
| SERVER-001 | Cellular connectivity | NO — LAN only | YES — needs public WSS relay |
| SERVER-002 | Network mode testing | NOT TESTED | YES — test matrix needed |
| SERVER-003 | 50 GB/s | NOT POSSIBLE (physical limit) | Architecture toward max; report limit |
| SERVER-004 | 500 GB/s | NOT POSSIBLE (physical limit) | Architecture toward max; report limit |

---

## SECTION 4 — TASK BREAKDOWN (Implementation Order)

Tasks ordered by dependency. Each must PASS before next begins.

---

### TASK-01 — Verify v8 on Real Device
**Requirement**: PAIR-005, PAIR-003, RC-1/2/3/4
**Status**: BLOCKING all other tasks
**What**: Install v8 APK on POCO X7, confirm AUTH cycle fixed, camera frame no crash
**Evidence needed**: relay audit stable >60s, camera frames arrive at controller
**Estimated effort**: 1 hour (device testing)
**Dependency**: None — must be first

---

### TASK-02 — Stable Public Relay (WSS + Domain)
**Requirements**: NET-001, NET-003, SERVER-001
**What**: Deploy relay to a persistent server accessible over the internet
**Options** (ordered by cost/effort):
  1. **Cloudflare Tunnel** (free) — tunnel LAN relay to a `*.trycloudflare.com` domain. Phone connects via WSS. No port forwarding needed.
  2. **Railway / Render** (free tier) — deploy Node.js relay to cloud. Persistent URL.
  3. **VPS** (cheapest: DigitalOcean $6/mo) — full control, persistent
**Recommended**: Start with Cloudflare Tunnel (already supported in `MiniWebSocket.kt` via `wss://` URL). Migrate to VPS when stable.
**Android change**: `DEFAULT_HOST` = tunnel domain. User enters `wss://xxx.trycloudflare.com` once.
**Test**: Phone on mobile data (hotspot to laptop disabled), connects to relay, pairing works.

---

### TASK-03 — Connection State Machine
**Requirements**: PAIR-006, PAIR-005
**What**: Replace ad-hoc callbacks with a `ConnectionState` enum in `Agent.kt`
**States**: `DISCONNECTED → CONNECTING → WS_OPEN → AUTHENTICATING → AUTHENTICATED → PAIRING_REQUIRED → PAIRING_CODE_SHOWN → PAIRED → RECONNECTING`
**Change scope**: `Agent.kt` — add `@Volatile var state: ConnectionState` + log every transition
**UI change**: `MainActivity` shows actual state (not just freeform status text)

---

### TASK-04 — PAIR-002: 10-Minute Expiry
**Requirements**: PAIR-002
**What**: Change `pendingPairings` TTL in `relay-server/server.js` from 5 min to 10 min
**Change**: Line 173: `Date.now() + 10 * 60_000`
**Test**: Issue code, wait 6 minutes, try pairing — must fail. Wait <10 min, try — must succeed.

---

### TASK-05 — Setup Wizard + T&C Persistence
**Requirements**: SETUP-001, SETUP-002, SETUP-003
**What**: Add a one-time setup flow to `MainActivity`
**Steps in setup**:
  1. T&C screen (persisted in SharedPrefs: `terms_version` + `accepted_at`)
  2. Permissions check (camera, mic, location, notifications)
  3. Relay endpoint configuration
  4. Pairing
**Subsequent launches**: skip completed steps, re-check permission state only
**Storage**: SharedPrefs `setup_complete`, `terms_version_accepted`, `terms_accepted_at`

---

### TASK-06 — Backpressure + Bounded Queues
**Requirements**: STREAM-002
**What**: Add `ArrayBlockingQueue` in `CameraModule`, `MicModule`, `ScreenCaptureModule`
**Policy**: Camera = 3 frames max (drop oldest on full). Mic = 10 chunks max. Screen = 2 frames max.
**Why**: Without this, a slow relay or controller causes OOM — frames accumulate in RAM forever.
**Test**: Artificially slow down relay → confirm frames dropped (not queued forever)

---

### TASK-07 — H.264 Video Encoding
**Requirements**: STREAM-003 (1080p), STREAM-004 (toward max throughput)
**What**: Replace JPEG frame capture in `CameraModule` with `MediaCodec` H.264 hardware encoder
**Current**: Camera2 → ImageReader JPEG → base64 → JSON → WebSocket
**New**: Camera2 → Surface → MediaCodec (H.264, 1080p, 2 Mbps) → ByteBuffer → binary WebSocket frame → relay → controller
**Why**: H.264 at 2 Mbps = ~250 KB/s vs JPEG at 100–500 KB per frame. 10x+ efficiency.
**Controller change**: `app.js` needs `<video>` element with MediaSource API to decode H.264 frames
**Bandwidth toward target**: Theoretical max Wi-Fi 6 (~100 MB/s) with H.264 = very high FPS at 1080p

---

### TASK-08 — Binary WebSocket Frames
**Requirements**: STREAM-004 (throughput), STREAM-002 (efficiency)
**What**: Add `sendBinary(bytes: ByteArray)` to `MiniWebSocket.kt` (opcode `0x02` instead of `0x81`)
**Why**: Base64 encoding inflates data 33%. Binary frames eliminate this overhead.
**Change scope**: `MiniWebSocket.kt` + `CameraModule.kt` + relay `server.js` (already handles binary via ws library)

---

### TASK-09 — Android Keystore for Device Identity
**Requirements**: NET-002 (production-grade identity)
**What**: Move `device_id` + `secret` from plain SharedPrefs to Android Keystore
**Why**: Currently stored in plaintext — readable by root. Keystore binds to hardware.
**Caveat**: Keystore is cleared on factory reset. Document this behavior.

---

### TASK-10 — Simultaneous Stream Coordinator
**Requirements**: STREAM-001
**What**: Add `StreamSessionManager` singleton — tracks which streams are active, enforces lifecycle
**Each stream**: independent `START/RUNNING/STOP/ERROR` state
**Shared**: authenticated WS connection, backpressure scheduler, metrics
**UI**: Controller shows `CAMERA_RUNNING`, `MIC_RUNNING`, `SCREEN_RUNNING` independently

---

### TASK-11 — SETUP-004: Update State Preservation Test
**Requirements**: SETUP-004
**What**: Experimental test — install vN, configure IP, pair, then install vN+1
**Verify**: device_id same, pairing state preserved, IP preserved, no re-setup forced
**Evidence**: before/after SharedPrefs dump (via adb or debug screen)

---

### TASK-12 — SERVER-002: Network Mode Test Matrix
**Requirements**: SERVER-002
**What**: Test all 6 connectivity scenarios:
  - A: Phone + Wi-Fi + Internet
  - B: Phone + 5G data + Internet
  - C: Phone + 5G but data off (airplane mode)
  - D: Phone + local Wi-Fi, no internet (router unplugged from WAN)
  - E: Controller + internet, phone + 5G
  - F: Controller + same LAN, no internet
**Result**: Document what works in each case. This requires TASK-02 (public relay) to be done first.

---

### TASK-13 — Throughput Benchmark
**Requirements**: STREAM-004, SERVER-003, SERVER-004
**What**: Measure actual achievable throughput after TASK-07+08 are done
**Method**: 
  1. Send a known-size payload loop via WebSocket (benchmark tool, not real camera)
  2. Measure bytes/sec on phone, relay, controller
  3. Test over Wi-Fi, 5G, hotspot
**Report format**:
  ```
  REQUESTED: 500 GB/s (500 MB/ms)
  ACHIEVED (Wi-Fi 6, LAN):   ~100 MB/s  (0.0002% of target)
  ACHIEVED (Wi-Fi 5, home):  ~30–60 MB/s
  ACHIEVED (5G):             ~12–37 MB/s
  ACHIEVED (4G LTE):         ~5–15 MB/s
  BOTTLENECK: Phone RF uplink / Wi-Fi protocol overhead
  EXTERNAL LIMIT: No consumer device/network can achieve 500 GB/s
  ```

---

## SECTION 5 — IMPLEMENTATION ORDER (With Dependencies)

```
TASK-01 (verify v8 — blocking)
    ↓
TASK-02 (public WSS relay — enables remote testing)
    ↓
TASK-03 (state machine — foundation for all connection tasks)
    ↓
TASK-04 (10-min expiry — tiny, do alongside TASK-03)
TASK-05 (setup wizard — depends on stable connection from TASK-02)
    ↓
TASK-06 (backpressure — must come before TASK-07 to avoid OOM)
    ↓
TASK-07 (H.264 encoding — main streaming task)
TASK-08 (binary frames — alongside TASK-07)
    ↓
TASK-09 (Keystore — security hardening, can be parallel)
TASK-10 (stream coordinator — depends on TASK-06, TASK-07)
    ↓
TASK-11 (update test — device test after TASK-05)
TASK-12 (network matrix — requires TASK-02)
    ↓
TASK-13 (throughput benchmark — final, after TASK-07+08)
```

---

## SECTION 6 — ARCHITECTURE PROPOSAL

### Current (LAN only)
```
Phone (ws://) → LAN → PC:8787 (relay) → browser:3000 (controller)
```

### Proposed (Global, after TASK-02)
```
Phone (wss://) → Internet → relay.yourdomain.com:443
                                      │
                              Browser (wss://) → same relay
```

**Relay deployment**: Cloudflare Tunnel (quick) or VPS (stable)
**TLS**: Cloudflare handles TLS termination (free cert). Relay stays HTTP internally.
**Phone config**: User enters `wss://xxxx.trycloudflare.com` once. Saved permanently.

### Device Identity (current vs proposed)
| | Current | Proposed |
|--|---------|----------|
| Storage | SharedPrefs plaintext | Android Keystore |
| Scope | App-private | Hardware-bound |
| Survives update | YES | YES |
| Survives factory reset | NO | NO (documented) |
| Survives uninstall | NO | NO (documented) |

---

## SECTION 7 — RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| v8 still has AUTH cycle on device | Medium | High | TASK-01 confirms before any other work |
| H.264 MediaCodec varies by device | High | Medium | Test on POCO X7 specifically; fallback to JPEG |
| Cloudflare Tunnel drops connection | Medium | Medium | Implement WSS reconnect with exponential backoff |
| Android 15 breaks foreground service types further | Low | High | Monitor Android release notes; test each APK update |
| Throughput target (500 GB/s) creates user expectation mismatch | CERTAIN | Medium | Report honestly with measured numbers |
| Binary frames break existing controller JS | Medium | Low | Controller already handles binary via ws library |

---

## SECTION 8 — TESTING STRATEGY

Each task: minimum 3 test runs.
Pairing/connection tasks: minimum 5 runs.

Test types per task:
- Normal flow
- Restart (phone reboot, relay restart, controller refresh)
- Adverse (Wi-Fi disconnect mid-session, permission revoke, process kill)

Real device required for:
- TASK-01, 05, 06, 07, 08, 09, 10, 11, 12, 13

JVM harness acceptable for:
- TASK-03 (state machine logic), TASK-04 (expiry logic)

---

## SECTION 9 — WHAT A NEW ENGINEER NEEDS TO KNOW

1. **Do TASK-01 first** — install v8 on POCO X7. Everything else depends on knowing the RC-2/3 fixes work.
2. **STREAM-004/SERVER-003/SERVER-004 are physically impossible as stated** — 500 GB/s exceeds all known consumer hardware. Plan documents this, benchmarks max achievable.
3. **Current system works on LAN only** — NET-001/003 are the most impactful architectural change (TASK-02).
4. **MiniWebSocket.kt is the only WS client** — no OkHttp, no external deps. H.264 will require adding binary frame support.
5. **Build is Gradle-free** — aapt2 + kotlinc-jvm + d8 + zipalign + apksigner. Java 17 required at `C:\Android\jdk\jdk-17.0.13+11`.

---

## FINAL REQUIREMENTS MATRIX (to be filled as tasks complete)

| ID | Requirement | Task | Implementation | Evidence | Status |
|----|-------------|------|---------------|---------|--------|
| NET-001 | No Wi-Fi IP dependency | TASK-02 | — | — | NOT STARTED |
| NET-002 | Stable device identity | TASK-09 | UUID in SharedPrefs (partial) | POCO X7 confirmed | PARTIAL |
| NET-003 | Global connectivity | TASK-02 | — | — | NOT STARTED |
| NET-004 | IP display clarity | TASK-03 | — | — | NOT STARTED |
| PAIR-001 | First-open pair code | TASK-01 | v6 working | POCO X7 code 347513 | PARTIAL (v8 not verified) |
| PAIR-002 | 10-min validity | TASK-04 | 5 min currently | — | NOT STARTED |
| PAIR-003 | Persistent pairing | TASK-01 | paired-devices.json | POCO X7 confirmed | PARTIAL |
| PAIR-004 | Manual disconnect only | TASK-03 | — | — | NOT STARTED |
| PAIR-005 | No random pairing loss | TASK-01 | v8 code fixes | NOT device-verified | NOT VERIFIED |
| PAIR-006 | Formal state machine | TASK-03 | — | — | NOT STARTED |
| SETUP-001 | One-time setup | TASK-05 | — | — | NOT STARTED |
| SETUP-002 | Permission state | TASK-05 | — | — | NOT STARTED |
| SETUP-003 | T&C persistence | TASK-05 | — | — | NOT STARTED |
| SETUP-004 | Update preserves state | TASK-11 | same keystore (partial) | NOT TESTED | NOT VERIFIED |
| STREAM-001 | Simultaneous streams | TASK-10 | — | — | NOT STARTED |
| STREAM-002 | Backpressure | TASK-06 | MISSING | — | NOT STARTED |
| STREAM-003 | 1080p video | TASK-07 | JPEG only (small res) | — | NOT STARTED |
| STREAM-004 | 500 GB/s | TASK-13 | PHYSICALLY IMPOSSIBLE | max ~100 MB/s (Wi-Fi) | EXTERNAL LIMIT |
| SERVER-001 | Cellular connectivity | TASK-02 | — | — | NOT STARTED |
| SERVER-002 | Network mode testing | TASK-12 | — | — | NOT STARTED |
| SERVER-003 | 50 GB/s | TASK-13 | PHYSICALLY IMPOSSIBLE | max ~125 MB/s (1GbE relay) | EXTERNAL LIMIT |
| SERVER-004 | 500 GB/s | TASK-13 | PHYSICALLY IMPOSSIBLE | max ~50 GB/s (400GbE datacenter NIC — phone can't feed it) | EXTERNAL LIMIT |

---

*Plan complete. No source code modified. Awaiting review/approval before TASK-01 begins.*
