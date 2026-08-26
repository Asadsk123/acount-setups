# HRAPP — Current Status (evidence-based)

Commit at audit: `f7b4ec6` · working tree: clean · branch: `claude/feasibility-check-timeline-f4hpk8`
Audit date: 2026-08-26

## Verification method note
- **Backend / protocol / controller↔relay↔agent-protocol**: verifiable here, via automated
  node test suites against the real relay. Re-run this audit — all pass (evidence below).
- **Controller UI**: verified earlier this session with Reticle (`verified:"yes"` on pairing,
  device-info, camera front/back, screen/mic/camera streaming). The in-app browser tool is
  currently blocked by an environment safety classifier, so those Reticle passes are cited from
  earlier in the session, not re-run now.
- **Android on-device runtime** (install, app launch, real camera/mic/screen capture, real audio):
  **NOT VERIFIED — no Android device or working emulator in this environment** (emulator needs
  hardware acceleration this machine lacks). These are marked NOT_VERIFIED, never claimed working.

## Test evidence (re-run at this audit)
```
test_vertical_slice   ALL CHECKS PASSED — pair -> auth -> PLAY_SOUND -> ACK -> result -> audit
test_modules          ALL MODULE CHECKS PASSED — capabilities, device info, location, input, lock, audit
test_streaming        ALL STREAMING CHECKS PASSED — screen/camera/mic frames delivered, stop works, audit not flooded
test_apps_notifs      ALL APPS/NOTIF CHECKS PASSED — notification, apps list, block+limit policy, uninstall prompt
test_reconnect        RECONNECT CHECK PASSED — stable device_id keeps the pairing alive across reconnect
```
Internet path (`test_internet.js`) passed earlier this session over a live cloudflared wss tunnel.

## Status matrix

| Area | Status | Evidence | Remaining work |
|---|---|---|---|
| Android build | VERIFIED_WORKING | `build_full.sh` produces signed+aligned APK; dex has all 18 modules; SHA-256 `db083f41…47893` | — |
| APK installation (device) | BLOCKED_BY_ENVIRONMENT | Structural checks all pass (v2/v3 sig, zipaligned, resources.arsc Stored, minSdk26/target34, 12,344 methods). Device shows "App not installed" — most probably the phone's Play Protect flags the permission profile. NOT reproduced here (no device). | User installs on their OWN device via the OS "install anyway" prompt. **No Play Protect bypass will be engineered.** |
| Agent startup | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Code compiles into dex; `HrappApplication.onCreate` → `Agent.init`; no device run | On-device launch test |
| Pairing | VERIFIED_WORKING | `test_vertical_slice`, `test_reconnect` pass; Reticle pairing pass earlier | — |
| Authentication | VERIFIED_WORKING | HMAC session token; wrong-PIN + forged-token rejected in `test_vertical_slice` | — |
| Relay | VERIFIED_WORKING | all suites route through it; audit endpoint 200 | — |
| Controller UI | VERIFIED_WORKING (earlier Reticle) | Reticle `verified:"yes"` on pair/device-info/camera/streaming this session | re-run blocked by env classifier now |
| Capability registry | VERIFIED_WORKING | `CAPABILITY_RESPONSE` in `test_modules`; controller renders chips | — |
| PLAY_SOUND (protocol+ACK) | VERIFIED_WORKING | `test_vertical_slice` pair→PLAY_SOUND→ACK→result→audit | — |
| PLAY_SOUND (real device audio) | NOT_VERIFIED | needs device speaker; ACK ≠ playback | on-device audio test |
| Screen (protocol) | VERIFIED_WORKING | `test_streaming` frames delivered + stop + audit | — |
| Screen (real MediaProjection capture) | IMPLEMENTED_NOT_RUNTIME_VERIFIED | `ScreenCaptureService` uses official MediaProjection per-session consent (no bypass) | on-device capture test |
| Input / remote control | IMPLEMENTED_NOT_RUNTIME_VERIFIED | `RemoteControlService` (official Accessibility, user-enabled); protocol tested | on-device test |
| Device info | VERIFIED_WORKING (protocol) | `test_modules` device-info round trip | on-device values |
| Location | IMPLEMENTED_NOT_RUNTIME_VERIFIED | official FINE_LOCATION flow; protocol path exists | on-device fix |
| Notifications | IMPLEMENTED_NOT_RUNTIME_VERIFIED | official NotificationListenerService (user-granted); `test_apps_notifs` protocol pass | on-device test |
| Apps / package info | IMPLEMENTED_NOT_RUNTIME_VERIFIED | PackageManager list; uninstall = official system dialog (not silent); `test_apps_notifs` pass | narrow QUERY_ALL_PACKAGES later |
| App block / time-limit | IMPLEMENTED_NOT_RUNTIME_VERIFIED | Accessibility HOME-bounce (non-root, visible service); policy tested | on-device test |
| Offline / cache | PARTIALLY_IMPLEMENTED | SharedPreferences for policy + device id; no durable event queue yet | add offline queue (MASTER §12/§45) |
| Data optimization | PARTIALLY_IMPLEMENTED | high-rate frames excluded from audit; base64-over-JSON (not delta/binary) | binary frames + delta sync later |
| Logging / audit | VERIFIED_WORKING | audit log in all suites; no secrets logged | — |
| Security | IMPLEMENTED_NOT_RUNTIME_VERIFIED | HMAC session, replay via nonce+seq (ADR-0003), ws→wss TLS added; no cert-pinning yet | pinning + on-device review |

## Priorities
- **P0 (blocker): APK install on device.** Root cause not device-reproduced here; most-probable is the
  phone's Play Protect flagging the sensitive-permission profile. Resolution is user-side ("install
  anyway" on an owned device) — **not** a bypass I will build. Real error needs `adb install` output
  from the user's own device to confirm.
- **P1: on-device runtime verification** of every IMPLEMENTED_NOT_RUNTIME_VERIFIED feature. Blocked
  here by no device/emulator.
- **P2**: durable offline queue; binary/delta streaming; narrower package visibility; cert pinning.

## Final status: **NOT YET VERIFIED**
Backend, protocol, pairing, auth, relay, controller UI, and every command's protocol path are
verified with automated + Reticle evidence. Android **on-device runtime is NOT verified** (no device
here), and APK **installation on the phone is unresolved** — its likely cause is the device's own
Play Protect, which will not be bypassed. On-device proof requires the user's authorized device.
