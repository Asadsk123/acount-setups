# HRAPP — Final Verification Report

Date: 2026-08-26 · Commit base: `9bf6cc3` (+ this report)

## Environment
- **Android runtime: NOT AVAILABLE.** Proven: `emulator -accel-check` → code 6,
  "Android Emulator hypervisor driver is not installed"; boot → `ERROR | x86_64 emulation
  currently requires hardware acceleration!`; AEHD install needs admin (`sc query aehd` → service
  absent); `Get-WindowsOptionalFeature` → "requires elevation". No physical device (`adb devices` empty).
- adb: ✅ v1.0.41 · emulator binary + AVD `hrapp_test` + x86_64 image: ✅ present but **not bootable**.
- Build env: ✅ JDK 21, Android SDK build-tools 35, kotlinc 1.9.24, Node — all working.

## Bugs fixed this cycle
| Bug | Root cause | Fix | Test |
|---|---|---|---|
| Unauthorized command execution | Relay router forwarded commands/events without checking sender auth/role | Require boundRole+boundDeviceId match; else AUTH_ERROR | test_authz PASS |
| Pairing code brute-force | Math.random code + no PAIR_REQUEST attempt cap | crypto randomInt + per-conn cap (RATE_LIMITED) | test_pairing_bruteforce PASS |
| APK would not install (earlier) | not zipaligned (API 30+ rejects) | zipalign step in build_full.sh | forensic: alignment OK (device install still NRV) |

## Automated test results (re-run at this report)
| Suite | Result |
|---|---|
| test_vertical_slice | PASS |
| test_modules | PASS |
| test_streaming | PASS |
| test_apps_notifs | PASS |
| test_reconnect | PASS |
| test_authz | PASS |
| test_pairing_bruteforce | PASS |

## Android on-device runtime
| Feature | Result | Reason |
|---|---|---|
| Install | NOT VERIFIED | no bootable emulator/device (accel/admin) |
| Launch | NOT VERIFIED | same |
| Pairing (on device) | NOT VERIFIED | same (backend path PASS) |
| Sound (real audio) | NOT VERIFIED | needs device speaker |
| Screen (MediaProjection) | NOT VERIFIED | needs device consent+capture |
| Camera | NOT VERIFIED | emulator has no real camera anyway |
| Microphone | NOT VERIFIED | needs device |
| Permissions dialogs | NOT VERIFIED | needs device |
| Reconnect (on device) | NOT VERIFIED | backend path PASS |

## APK (fresh clean build)
| Field | Value |
|---|---|
| Path | `hrapp-remote.apk` (repo root + controller/public) |
| SHA-256 | `6ea786f10e42a80c062060d9ee413ce3f805a0d685ddbd8a8c265d19f2b184c7` |
| Size | 754,366 bytes |
| Package | com.hrapp.remote |
| versionCode / Name | 2 / 1.0 |
| minSdk / targetSdk | 26 / 34 |
| Signature | v2+v3 valid · zipaligned · resources.arsc Stored |

## Security posture
Command authorization enforced · pairing brute-force guarded · HMAC session tokens ·
replay via nonce+seq (ADR-0003) · wss/TLS available · no secrets logged · every sensitive
Android feature uses official consent (MediaProjection / CAMERA / RECORD_AUDIO / Accessibility /
DeviceAdmin / NotificationListener) — no bypass anywhere.

## Remaining blocker (genuine)
On-device runtime verification requires either:
1. This PC: admin install of AEHD (`silent_install.bat` as Administrator) + BIOS virtualization + reboot, or
2. A physical authorized Android phone connected via USB debugging (`adb devices` shows it).

## FINAL STATUS: **NOT_YET_VERIFIED**
Backend, protocol, relay, controller, and security are verified (automated + earlier Reticle).
Android on-device runtime is NOT verified because no bootable emulator/device exists in this
environment. No feature was faked, removed, or bypassed to reach this state.
