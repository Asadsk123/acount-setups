# HRAPP — Feature Matrix

Legend: VERIFIED_WORKING · IMPL_NRV (implemented, not runtime-verified on device) ·
PARTIAL · PLACEHOLDER · NOT_IMPL · BLOCKED_BY_ANDROID

| Feature | Controller | Relay | Protocol | Android code | Tests | Runtime (device) | Status |
|---|---|---|---|---|---|---|---|
| Pairing | ✅ | ✅ | ✅ | ✅ | test_vertical_slice, test_reconnect, test_pairing_bruteforce | NRV | VERIFIED_WORKING (backend) |
| Authentication | ✅ | ✅ | ✅ | ✅ | test_vertical_slice, test_authz | NRV | VERIFIED_WORKING (backend) |
| Command authorization | ✅ | ✅ | ✅ | n/a | **test_authz** | n/a | VERIFIED_WORKING |
| Pairing brute-force guard | n/a | ✅ | n/a | n/a | **test_pairing_bruteforce** | n/a | VERIFIED_WORKING |
| Capability discovery | ✅ | ✅ | ✅ | ✅ | test_modules | NRV | VERIFIED_WORKING (backend) |
| PLAY_SOUND | ✅ | ✅ | ✅ | ✅ | test_vertical_slice | NRV (real audio) | IMPL_NRV |
| Device info | ✅ | ✅ | ✅ | ✅ | test_modules | NRV | IMPL_NRV |
| Location | ✅ | ✅ | ✅ | ✅ | test_modules | NRV | IMPL_NRV |
| Remote input (Accessibility) | ✅ | ✅ | ✅ | ✅ | test_modules | NRV | IMPL_NRV |
| Lock (Device Admin) | ✅ | ✅ | ✅ | ✅ | test_modules | NRV | IMPL_NRV |
| Screen (MediaProjection) | ✅ | ✅ | ✅ | ✅ | test_streaming | NRV | IMPL_NRV |
| Camera front/back | ✅ | ✅ | ✅ | ✅ | test_streaming | NRV | IMPL_NRV |
| Microphone | ✅ | ✅ | ✅ | ✅ | test_streaming | NRV | IMPL_NRV |
| Notifications | ✅ | ✅ | ✅ | ✅ | test_apps_notifs | NRV | IMPL_NRV |
| Apps list + uninstall | ✅ | ✅ | ✅ | ✅ | test_apps_notifs | NRV | IMPL_NRV |
| App block / time-limit | ✅ | ✅ | ✅ | ✅ | test_apps_notifs | NRV | IMPL_NRV |
| Reconnect (stable id) | ✅ | ✅ | ✅ | ✅ | test_reconnect | NRV | VERIFIED_WORKING (backend) |
| Internet (wss tunnel) | ✅ | ✅ | ✅ | ✅ | test_internet (live tunnel) | NRV | VERIFIED_WORKING (backend) |
| Audit log | ✅ | ✅ | n/a | n/a | all suites | n/a | VERIFIED_WORKING |
| APK download from dashboard | ✅ | n/a | n/a | n/a | curl 200 | n/a | VERIFIED_WORKING |
| Offline event queue | ❌ | ❌ | ❌ | partial (prefs) | — | — | PARTIAL |
| Delta / binary streaming | ❌ | ❌ | ❌ | ❌ | — | — | NOT_IMPL (P2) |
| APK install on device | — | — | — | — | — | NRV / blocked by device Play Protect | BLOCKED (user-side, no bypass) |

## Android-sensitive features — all use official consent (no bypass)
| Feature | Android API | User consent | Bypass? |
|---|---|---|---|
| Screen | MediaProjection | per-session system dialog | never |
| Camera | CAMERA runtime perm | system dialog + OS privacy indicator | never |
| Microphone | RECORD_AUDIO runtime perm | system dialog + OS mic indicator | never |
| Remote input / app-block | AccessibilityService | user enables in Settings | never |
| Lock | DeviceAdmin | user activates admin | never |
| Notifications | NotificationListenerService | user grants Notification access | never |
| Uninstall | ACTION_DELETE | system uninstall dialog (not silent) | never |

## What "NRV" means here
Backend/protocol/controller paths are proven by automated suites + earlier Reticle UI passes.
The Android **on-device** behaviour (real capture, real audio, real permission dialogs, install)
is NOT VERIFIED because there is no Android device/working emulator in this environment. These stay
IMPL_NRV until tested on the user's authorized device — never claimed working without that evidence.
