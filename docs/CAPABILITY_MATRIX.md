# Capability matrix

Per MASTER.md §7 / CLAUDE_CODE_ARCHITECTURE.md §4 — never collapse this to a single `authenticated == allow everything` check. Every capability resolves through four independent layers:

```text
CAPABILITY
├── OS_PERMISSION          (does Android currently grant this?)
├── DEVICE_STATE            (is the underlying hardware/service on? e.g. GPS enabled)
├── APP_POLICY              (is this module enabled in the feature registry / policy engine?)
├── SESSION_AUTHORIZATION   (did this specific controller session get authorized for it?)
└── FINAL_CAPABILITY_STATE  (AND of all four — recomputed on every check, never cached as "always true")
```

## v1 capability list

| Capability | OS permission required | Notes |
|---|---|---|
| `pairing` | none | always available |
| `device_info` | none | §26 |
| `location` | `ACCESS_FINE_LOCATION` (+ background variant) | §21 |
| `screen` | `MediaProjection` consent (per-session, Android 14+) | §19 — cannot be granted once and reused |
| `input` | Accessibility service | §20 |
| `usage` | `PACKAGE_USAGE_STATS` | §22 |
| `notifications` | Notification listener access | §23 |
| `apps` | none (or `QUERY_ALL_PACKAGES` depending on Android version) | §24 |
| `restrictions` | Device Admin / Accessibility, device-dependent | §25 |
| `push_to_sound` | none (local playback only) | ADR-0004 |
| `push_wakeup` | Google Play Services (FCM) or foreground-service notification | ADR-0002 |
| `screen` | `MediaProjection` consent (per-session, Android 14+) + mediaProjection foreground service | §19 — JPEG frame stream |
| `camera` | `CAMERA` runtime permission | §27 — Camera2 JPEG stream; OS privacy indicator stays visible |
| `mic` | `RECORD_AUDIO` runtime permission | §11 — PCM chunk stream; OS mic indicator stays visible |
| `calling` | — | Phase 2, not v1 |

**Deliberately absent — remote unlock.** No capability exists for it and none can: Android gives no third-party API to dismiss the lock screen or supply the user's credential. `lock` is offered; unlock is not (MASTER.md §17/§50).

The controller must re-fetch this per device on every connect (`CAPABILITY_REQUEST`) — a capability granted last session may have been revoked since (MASTER.md §18).
