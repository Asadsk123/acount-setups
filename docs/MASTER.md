# Lightweight Android Remote Management System
## MASTER ARCHITECTURE & DEVELOPMENT SPECIFICATION

**Document type:** Master project specification
**Status:** Ready for development planning and implementation
**Primary target:** Android phone + Windows/Linux/macOS laptop controller
**Distribution:** Direct APK / controlled distribution; Play Store is not required for the initial project
**Design priority:** Modular, lightweight, low-data, secure, maintainable, extensible

> This file is the authoritative platform spec (per its own Section 42 rule). `CLAUDE_CODE_ARCHITECTURE.md` and `FEASIBILITY_AND_ESTIMATE.md` (from an earlier session in this repo) are kept as reference — their Push-to-Sound feature and their three identified blockers are folded in here as ADR-0001..0004 (see `docs/adr/`) and as Module 2.3 below.

**Authorization scope (confirmed with operator):** this system is for devices the operator owns or has explicit family/authorized authority over. No covert or hidden monitoring — pairing and consent stay visible on the Android device at all times.

---

# 1. Executive Summary

This project is a lightweight Android **remote-management and authorized remote-control system**.

The Android phone runs a small agent application. A laptop/PC runs the controller. The controller can request permitted device information, view the phone screen, and perform authorized remote interactions. The system should prefer direct local-network communication and use an Internet relay only when necessary.

The architecture must be **modular from day one** so that features can later be added, removed, replaced, or upgraded without rewriting the entire application.

The system must never depend on hidden permission bypasses. Android-enforced permissions, consent dialogs, privacy indicators, and privileged-operation restrictions must be respected.

---

# 2. Core Product Definition

## 2.1 Phone side

The phone application is a lightweight **Agent**.

Responsibilities:

- Secure device identity
- Pairing
- Authentication
- Connection management
- Screen capture/session management
- Authorized remote input
- Location information
- Location history
- Geofence rules
- App usage information
- Notification information where permitted
- Installed-app information
- Device status
- Battery information
- Network information
- App/device restrictions where supported
- Local cache
- Offline queue
- Data-efficient synchronization

## 2.2 Laptop side

The laptop application is the **Controller**.

Responsibilities:

- Device discovery/pairing
- Authentication
- Device dashboard
- Live connection status
- Screen viewer
- Remote input
- Device information
- Location dashboard
- Usage dashboard
- Notification dashboard
- App management
- Restriction management
- Logs/status
- Connection diagnostics
- Future camera/audio modules

## 2.3 Push-to-Sound module (folded in from prior architecture review)

Controller has a button: press it, the paired Android device plays a predefined local sound (e.g. a locator "tan tan" sound) so the device can be found. No live audio streaming in v1 (Option A — predefined sound over Option B — live push-to-talk audio). Full state machine, protocol, and UX rules are defined in `docs/adr/ADR-0004-push-to-sound.md`. This is a phone-side responsibility (plays sound) and a controller-side responsibility (sends the command), so it also belongs in both 2.1 and 2.2's module lists conceptually — listed here as its own module because it is architecturally independent of Screen/Input/Location/etc.

---

# 3. Non-Negotiable Design Principles

1. **Modular architecture**
2. **Feature isolation**
3. **Minimum APK size**
4. **Minimum data consumption**
5. **LAN-first communication**
6. **Internet fallback**
7. **Offline-capable local cache**
8. **Secure authentication**
9. **Encryption in transit**
10. **Explicit permission handling**
11. **No permission bypass**
12. **No hidden surveillance mechanisms**
13. **Every feature independently enable/disable-able**
14. **Future features must be plug-in/module friendly**
15. **Removing a feature must not require rewriting unrelated modules**
16. **Versioned protocols**
17. **Backward-compatible configuration where practical**
18. **Centralized configuration instead of hard-coded behavior**
19. **Automated tests for core components**
20. **Observability and diagnostics without unnecessary telemetry**

---

# 4. Architecture Overview

```text
                         ┌─────────────────────────┐
                         │       LAPTOP / PC       │
                         │       CONTROLLER        │
                         ├─────────────────────────┤
                         │ UI / Dashboard          │
                         │ Device Manager          │
                         │ Screen Viewer           │
                         │ Input Controller        │
                         │ Information Viewer      │
                         │ Settings                │
                         └────────────┬────────────┘
                                      │
                           Secure protocol layer
                                      │
                     ┌────────────────┴────────────────┐
                     │                                 │
                SAME LAN                         INTERNET
               Direct path                    Relay/fallback
                     │                                 │
                     └────────────────┬────────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │     ANDROID AGENT       │
                         ├─────────────────────────┤
                         │ Core                    │
                         │ Authentication          │
                         │ Pairing                 │
                         │ Connection              │
                         │ Permission Manager      │
                         │ Module Manager           │
                         ├─────────────────────────┤
                         │ Feature Modules          │
                         │ Screen                  │
                         │ Remote Input            │
                         │ Location                │
                         │ Usage                   │
                         │ Notifications           │
                         │ Apps                    │
                         │ Restrictions            │
                         │ Push-to-Sound           │
                         │ Device Info             │
                         ├─────────────────────────┤
                         │ Local Data               │
                         │ Cache                   │
                         │ Event Queue             │
                         │ Configuration           │
                         └────────────┬────────────┘
                                      │
                              Android APIs
```

---

# 5. Modular Architecture

The most important architectural requirement is:

> **No feature should be tightly coupled to another feature.**

Recommended module layout:

```text
project/
├── android-agent/
│   ├── core/
│   ├── auth/
│   ├── pairing/
│   ├── transport/
│   ├── permissions/
│   ├── modules/
│   │   ├── screen/
│   │   ├── input/
│   │   ├── location/
│   │   ├── usage/
│   │   ├── notifications/
│   │   ├── apps/
│   │   ├── restrictions/
│   │   ├── push-to-sound/
│   │   └── device-info/
│   └── storage/
│
├── controller/
│   ├── ui/
│   ├── device-manager/
│   ├── transport/
│   ├── modules/
│   │   ├── screen/
│   │   ├── input/
│   │   ├── location/
│   │   ├── usage/
│   │   ├── notifications/
│   │   ├── apps/
│   │   ├── restrictions/
│   │   ├── push-to-sound/
│   │   └── device-info/
│   └── storage/
│
├── protocol/
│   ├── messages/
│   ├── schemas/
│   ├── versions/
│   └── compatibility/
│
├── relay-server/
│   ├── authentication/
│   ├── signaling/
│   └── relay/
│
├── shared/
│   ├── models/
│   ├── crypto/
│   ├── logging/
│   └── utilities/
│
└── docs/
    ├── MASTER.md
    ├── ARCHITECTURE.md
    ├── PROTOCOL.md
    ├── SECURITY.md
    ├── MODULES.md
    ├── PERMISSIONS.md
    ├── ROADMAP.md
    └── adr/
```

---

# 6. Feature Module Contract

Every feature module must follow a common contract.

```text
Module
├── metadata
├── capability declaration
├── permission requirements
├── configuration
├── lifecycle
├── request handlers
├── response handlers
├── local storage
├── diagnostics
└── tests
```

Conceptually:

```text
Module {
    id
    version
    enabled
    capabilities[]
    permissions[]
    start()
    stop()
    health()
    handleRequest()
}
```

This allows add / remove / disable / upgrade / replace / test-independently without changing the entire application.

---

# 7. Feature Registry

Do not hard-code feature availability throughout the application. Use a central capability registry.

Example:

```text
screen.enabled = true
input.enabled = true
location.enabled = true
usage.enabled = true
notifications.enabled = true
apps.enabled = true
restrictions.enabled = true
push_to_sound.enabled = true
camera.enabled = false
microphone.enabled = false
audio.enabled = false
calling.enabled = false
```

The controller asks the phone `GET_CAPABILITIES`; the phone responds with the enabled module list. Adding camera/microphone/audio/calling later must not require a redesign.

---

# 8. Current Feature Set

| Module | Version 1 | Notes |
|---|---:|---|
| Pairing | YES | Secure device association |
| Authentication | YES | Required |
| Secure transport | YES | Required |
| Push-to-Sound | YES | Predefined sound only (Option A) — see ADR-0004 |
| Screen viewing | YES | MediaProjection-based |
| Remote input | YES | Android restrictions apply |
| Location | YES | Permission required |
| Location history | YES | Local storage first |
| Geofence | YES | OS/location dependent |
| App usage | YES | Usage access required |
| Notifications | YES | Notification access required |
| Installed apps | YES | Android-version dependent |
| Device info | YES | Battery/network/storage/etc. |
| App restrictions | YES* | Device/OS dependent |
| Screen-time rules | YES* | Device/OS dependent |
| Local cache | YES | Required |
| LAN mode | YES | Preferred |
| Internet fallback | YES | Secure relay |
| Camera | NO | Phase 2 |
| Microphone | NO | Phase 2 |
| Speaker/audio (live) | NO | Phase 2 |
| Calling | NO | Phase 2 |

`*` Exact enforcement capabilities vary by Android version, OEM, and device-management level.

---

# 9. Connection Architecture

## 9.1 Connection priority

```text
1. Direct LAN
       ↓
2. Direct peer connection where practical
       ↓
3. Secure relay
       ↓
4. Offline/local cache
```

## 9.2 LAN mode

```text
PHONE ───── Wi-Fi/LAN ───── LAPTOP
```

Internet should not be required for normal local communication. Benefits: lower latency, lower Internet usage, lower relay cost, better screen-control responsiveness, works without Internet if LAN is available.

---

# 10. Internet Mode

```text
PHONE → Internet → Secure relay/signaling → Internet → LAPTOP
```

The server should primarily provide authentication, device discovery, signaling, connection negotiation, and relay fallback. It should not permanently store screen streams or unnecessary device data.

---

# 11. Data Efficiency

## 11.1 Information

`Request → Generate → Compress → Send → Cache`. Do not continuously transmit all information.

## 11.2 State synchronization

Send only changes ("battery changed: 72 → 71"), not periodic identical readings.

## 11.3 Screen

Use hardware-accelerated encoding, adaptive resolution/bitrate/frame rate, keyframes when required, frame skipping, idle detection, compression.

---

# 12. Offline Architecture

## 12.1 Same LAN, no Internet

Fully usable for features that do not require an external Internet service.

## 12.2 No network at all

The phone still collects locally permitted information (usage, location, device state, events, configuration, pending commands where safe). When connection returns: local queue → synchronizer → laptop. Do not queue dangerous or stale control commands blindly — commands need timestamps, expiry, and safety validation.

---

# 13. Local Storage

```text
Database
├── device
├── configuration
├── permissions
├── location_events
├── usage_events
├── notification_events
├── connection_events
├── pending_sync
└── audit_events
```

Sensitive data should be minimized and retained only as long as required by the feature.

---

# 14. Protocol Design

The protocol must be versioned. See `docs/PROTOCOL.md` for the concrete schema. Every request needs protocol version, message type, request ID, timestamp, authentication context, payload, and error code where applicable.

---

# 15. Protocol Compatibility

Future versions must not break old modules unnecessarily. Unknown fields should be safely ignored where possible. Feature negotiation: `Controller → CAPABILITY_REQUEST`, `Agent → CAPABILITY_RESPONSE`. The controller must not send commands for unsupported modules.

---

# 16. Authentication & Pairing

```text
Install Agent → Open Agent → Generate device identity → Show QR/PIN
     → Controller scans/enters code → Mutual authentication
     → Cryptographic keys established → Device paired
```

Future connections use stored cryptographic identity rather than repeating pairing. Must support: revoke device, unpair, re-pair, key rotation, session expiration, device naming, multiple authorized controllers if required.

---

# 17. Security Model

Required: encryption in transit, strong device authentication, secure pairing, session authentication, replay protection, request IDs, timestamps/nonces, capability authorization, permission validation, audit logging, secure local storage for secrets.

Do not implement: permission bypass, hidden privilege escalation, credential theft, stealth persistence, covert camera/microphone activation, security-control circumvention.

---

# 18. Android Permission Model

Centralized Permission Manager covering location, usage_access, notification_access, accessibility/control, screen_capture, and future camera/microphone. The app must never assume a permission exists just because it was granted previously — check current state before using the related feature.

---

# 19. Screen Capture

Android MediaProjection is the mechanism. **Android 14+ requires user consent for each MediaProjection capture session** — the architecture must not promise permanent screen-capture authorization.

```text
Controller requests screen → Agent checks current session → If valid, start stream
     → If not valid, Android consent flow → User authorizes → Capture session starts
     → Encoder → Secure transport → Controller
```

---

# 20. Remote Input

```text
Controller → INPUT_COMMAND → Input abstraction layer → Android-supported interaction mechanism
```

Supported command types: tap, swipe, long press, back, home where permitted, recent apps where permitted, text input where permitted. Exact capabilities depend on Android version and user-enabled services.

---

# 21. Location Module

Responsibilities: current location, timestamp, accuracy, location history, geofence rules, sync. Collect locally → compress/aggregate → sync only required data. Avoid excessive GPS polling; use adaptive intervals based on movement, requested accuracy, battery state, geofence state.

---

# 22. Usage Module

Collect only required metrics: app identifier, usage duration, last-used timestamp, daily totals, session info where supported. Phone calculates summary → laptop receives summary. Do not continuously transmit raw usage information.

---

# 23. Notification Module

Detect permission state, capture permitted notification information, normalize it, apply retention rules, sync only required information. Do not assume every application exposes identical notification content.

---

# 24. App Module

Responsibilities: installed-app inventory where permitted, package identifier, display name, version, install/update state where available. Keep independent from the restriction module.

---

# 25. Restriction Module

App restrictions, screen-time rules, schedule rules, blocked-app configuration.

```text
Policy → Policy Engine → Android enforcement mechanism → Status
```

Policy engine must be independent from the UI.

---

# 26. Device Information Module

Expose: device model, manufacturer, Android version, battery, charging, storage, network state, Wi-Fi state, mobile-data state, connection quality where available, app version, agent status. Schema must be versioned.

---

# 27. Future Camera Module

Not part of Version 1. `CameraModule { capabilities(), start(), stop(), stream(), status() }`. Android camera permissions and privacy indicators must be respected.

---

# 28. Future Microphone Module

Not part of Version 1. `MicrophoneModule { capabilities(), start(), stop(), stream(), status() }`. Android microphone permission and privacy indicators must be respected.

---

# 29. Future Audio/Speaker Module (live, bidirectional)

Not part of Version 1 (v1 has Push-to-Sound only — predefined sound, see §2.3 and ADR-0004). Architecture should allow phone mic ↔ audio transport ↔ laptop ↔ phone speaker, with independent codec, bitrate, buffer, latency, echo handling, mute, volume configuration.

---

# 30. Future Calling Module

Independent module. Do not mix call logic into the core connection system. `CallingModule { call state, audio session, video session, permissions, call controls, connection management }`.

---

# 31. Airplane Mode / Mobile Data Controls

Do not design Version 1 around an assumption that a normal third-party Android app can silently toggle all system radio settings. The UI can provide supported system settings shortcuts. Privileged device-management capabilities may be available on specially managed/provisioned devices, but must be treated as a separate capability. Capability registry: `airplane_mode_control`, `mobile_data_control` = SUPPORTED/UNSUPPORTED. The controller should detect actual capability instead of showing a button that cannot work.

---

# 32. UI Architecture

```text
UI → Application Services → Module Interfaces → Android Adapters
```

Example: `LocationScreen → LocationService → LocationModule → AndroidLocationAdapter`.

---

# 33. Configuration System

Avoid hard-coded settings. Use versioned configuration (`connection`, `screen`, `location`, `usage`, `notifications`, `restrictions`, `storage`, `security`). Settings should be centrally validated.

---

# 34. Feature Flags

```text
FEATURE_SCREEN=true
FEATURE_INPUT=true
FEATURE_LOCATION=true
FEATURE_USAGE=true
FEATURE_NOTIFICATIONS=true
FEATURE_RESTRICTIONS=true
FEATURE_PUSH_TO_SOUND=true

FEATURE_CAMERA=false
FEATURE_MIC=false
FEATURE_AUDIO=false
FEATURE_CALLING=false
```

---

# 35. Logging

Levels: ERROR, WARN, INFO, DEBUG. Never log passwords, private keys, authentication secrets, or unnecessary personal content. Logging is local by default; optional diagnostic export can be generated by the user.

---

# 36. Error Handling

Standardized errors: `PERMISSION_REQUIRED`, `NOT_SUPPORTED`, `DEVICE_OFFLINE`, `AUTH_FAILED`, `SESSION_EXPIRED`, `MODULE_DISABLED`, `TIMEOUT`, `ANDROID_RESTRICTION`, `NETWORK_ERROR`. The UI converts technical errors into understandable messages.

---

# 37. Testing Strategy

**Unit:** protocol, encryption wrappers, configuration, policy engine, data compression, storage, synchronization.
**Integration:** pairing, authentication, LAN connection, Internet relay, reconnection, offline queue, module discovery.
**Android device tests:** multiple Android versions, screen resolutions, OEMs, battery states, Wi-Fi/mobile transitions, permission changes.

---

# 38. Development Phases

Phase 0 — Repository foundation (repo, build system, module structure, CI, coding standards, docs, protocol schema, basic test framework)
Phase 1 — Core Agent (Android app, device identity, pairing, auth, secure transport, connection manager, permission manager, capability registry, local DB/cache)
Phase 2 — Controller (laptop app, device list, pairing UI, auth, connection status, settings, diagnostics)
Phase 3 — Screen (MediaProjection flow, encoder, adaptive stream, viewer, connection recovery)
Phase 4 — Remote Input (tap, swipe, keyboard, navigation, input status, error handling)
Phase 5 — Information Modules (location, location history, geofence, app usage, notifications, installed apps, device info, battery, network)
Phase 6 — Management (app restrictions, screen-time policies, schedules, policy engine)
Phase 7 — Optimization (LAN-first routing, compression, adaptive screen quality, delta sync, offline cache, battery optimization, APK size optimization)
Phase 8 — Hardening (security review, permission review, auth testing, reconnection testing, OEM compatibility, crash handling, recovery testing)
Phase 9 — Future Modules (camera, microphone, speaker/audio, calling — each an independent module, only after core is stable)

*Push-to-Sound (§2.3) slots into Phase 5/6 as its own module — see `docs/adr/ADR-0004-push-to-sound.md` for exact placement and reasoning.*

---

# 39. Definition of Done — Version 1

Pairing works; authentication works; secure connection works; LAN mode works; Internet fallback works; device can reconnect; screen viewing works under Android permission rules; authorized input works where supported; location works where permitted; usage information works where permitted; notification information works where permitted; device information works; app inventory works where supported; restriction subsystem works where supported; Push-to-Sound works end-to-end with audit trail; offline cache works; synchronization works; feature discovery works; unsupported features fail gracefully; no module depends unnecessarily on another module; core tests pass; security checks pass; APK size is measured and optimized; battery/data consumption is measured.

---

# 40. Future Change Policy

**Never modify the core just to add a normal feature.**

```text
New Feature → New Module → Register capability → Add protocol messages → Add controller UI → Add tests
```

Existing screen/location/usage modules should remain unchanged unless an explicit shared-interface change is required.

---

# 41. Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). Protocol version and application version are separate.

---

# 42. Repository Documentation

```text
docs/
├── MASTER.md          (this file — authoritative)
├── ARCHITECTURE.md
├── MODULES.md
├── PROTOCOL.md
├── SECURITY.md
├── PERMISSIONS.md
├── STORAGE.md
├── NETWORKING.md
├── TESTING.md
├── BUILD.md
├── RELEASE.md
├── ROADMAP.md
└── adr/               (decision records — see ADR-0001..0004)
```

`MASTER.md` is the authoritative project specification.

---

# 43. Change Management

Whenever a feature is added or removed: update module registry → update capability schema → update protocol schema if necessary → update permissions documentation → add/update tests → update controller UI → update Android implementation → update MASTER.md → update version → record migration impact. Never silently change protocol behavior.

---

# 44. Data Model Principles

All important data must have unique ID, timestamp, version, source, type, retention policy where applicable.

```text
Event { id, device_id, type, timestamp, schema_version, payload }
```

---

# 45. Synchronization

```text
PHONE → Local event/state → Pending sync → Connection available → Sync engine → Controller
```

Requirements: deduplication, ordering, retry, backoff, expiry, conflict handling, version checking.

---

# 46. Battery Optimization

Do not keep every subsystem active continuously. Use event-driven work, adaptive polling, OS-supported background mechanisms, batching, local computation, network batching, idle mode. Screen streaming is naturally high-power and should only run during an active session.

---

# 47. Resource Budget

Must measure: APK (base size, installed size, native library size), Memory (idle/active-screen/peak RAM), Battery (idle/location/screen-streaming consumption), Network (idle bytes, information-sync bytes, screen bytes/minute). These become release criteria.

---

# 48. Distribution

```text
Build → Sign → Checksum → Upload → Download link → Install on authorized phone
```

Android may require the user to explicitly allow installation from the source used to distribute the APK. The APK must be signed consistently so future updates install over the previous version. **Decided (ADR-0001): sideload / direct APK, self- or family-paired devices, not Play Store for v1.**

---

# 49. Release Channels

`Development → Internal Test → Beta → Stable`. Do not send an untested development APK as the stable release.

---

# 50. Security & Privacy Boundary

The product is intended for user-owned devices, family devices where the user has appropriate authority, explicitly authorized remote support, and legitimate device administration.

It must **not** be designed to hide monitoring from the device user, bypass Android security, secretly activate camera/microphone, steal credentials, circumvent permission systems, or disable security protections without authorization.

System privacy indicators and Android consent mechanisms must remain intact.

---

# 51. Recommended Initial Technology Direction

**Android Agent:** Kotlin, Android SDK, Android-native APIs, minimal dependencies, modular Gradle structure, hardware-accelerated media APIs where applicable.

**Controller:** **Decided — local web UI** (React/Next.js served locally), so it can be built and verified in a browser during development. Communicates through the same versioned protocol regardless of UI technology.

**Backend:** minimal services only — authentication, signaling, relay, device registry. Avoid unnecessary backend infrastructure.

---

# 52. First Implementation Order

```text
1. Repository            10. Capability discovery      19. App module
2. Module interfaces     11. LAN connection             20. Device-info module
3. Protocol schemas      12. Internet fallback          21. Restriction module
4. Android build         13. Local storage               22. Offline synchronization
5. Controller build      14. Screen module                23. Data optimization
6. Device identity       15. Input module                 24. Security hardening
7. Pairing                16. Location module              25. Device/OEM testing
8. Authentication          17. Usage module
9. Secure transport        18. Notification module
```

---

# 53. Master Architectural Rule

> **The Core provides infrastructure. Modules provide features.**

```text
Core
├── identity
├── authentication
├── transport
├── protocol
├── permissions
├── module registry
├── configuration
├── storage
├── logging
└── synchronization
```

Feature-specific logic belongs inside the feature module. This is the main mechanism that makes future additions/removals easy.

---

# 54. Final Project Statement

This project is a **lightweight, modular Android remote-management platform** consisting of an Android Agent and a laptop Controller. The Agent provides authorized device information and remote interaction capabilities. The Controller presents those capabilities through a centralized interface.

The platform is modular, low-data, LAN-first, Internet-capable, offline-cache capable, secure, permission-aware, extensible, testable, maintainable, and suitable for future camera/audio/calling modules.

The architecture must be treated as a **platform**, not as a one-off application. Every future feature should be added as a module whenever possible.

---

# 55. Immediate Next Step

1. Create repository structure. ✅ done (this repo)
2. Create `MASTER.md` from this specification. ✅ done (this file)
3. Create protocol schema. ✅ done — `docs/PROTOCOL.md`
4. Define module interfaces. → Phase 1
5. Define device identity and pairing flow. → Phase 1
6. Define authentication/session model. → Phase 1
7. Define LAN transport. → Phase 2
8. Define Internet relay abstraction. → Phase 2
9. Create Android Agent skeleton. → Phase 1
10. Create Controller skeleton. → Phase 2
11. Build and test the first end-to-end **pair → authenticate → capability discovery → disconnect/reconnect** flow. → vertical slice, see FEASIBILITY_AND_ESTIMATE.md §7

Only after this foundation works should feature modules be implemented.

---

## Authority

This file is the **master functional and architectural specification** for the project.

Any future implementation, feature addition, removal, refactor, or optimization should first check this document.

When requirements change, update this file first, then update the affected modules and tests.

**End of Master Specification**
