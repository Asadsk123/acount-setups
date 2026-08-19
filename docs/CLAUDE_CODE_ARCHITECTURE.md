# Android Agent + Controller — System Architecture
## Architecture Specification for Claude Code

> Status: Architecture v1.0  
> Goal: Build a production-oriented Android Agent + Controller system with secure pairing, capability-based permissions, offline-first behavior, telemetry, screen/media features, and an explicit Push-to-Sound interaction.

---

## 1. Product Goal

Build a secure system with:

- Android Agent application
- Web/Desktop Controller
- Secure device pairing
- Capability-based authorization
- Location telemetry
- Screen/session features subject to Android consent
- Optional microphone/media features subject to Android permissions and visible user consent
- Offline event queue + later synchronization
- LAN-first communication where appropriate
- Cloud relay only when required
- Audit logging
- Push-to-Sound feature

### Important platform rule

The implementation MUST NOT attempt to bypass Android permission, privacy, foreground-service, MediaProjection, battery, OEM, or lifecycle restrictions.

The product should use:

> one-time onboarding where possible + explicit capability state management

rather than assuming permissions can never be revoked or re-requested.

---

# 2. High-Level Architecture

```text
                         ┌───────────────────────┐
                         │      CONTROLLER       │
                         │ Web / Desktop / App   │
                         └───────────┬───────────┘
                                     │
                              Secure Session
                                     │
                         ┌───────────▼───────────┐
                         │ Gateway / Relay       │
                         │ Optional Cloud        │
                         └───────────┬───────────┘
                                     │
                           Internet / LAN / BT*
                                     │
                  ┌──────────────────▼──────────────────┐
                  │             ANDROID AGENT           │
                  │                                     │
                  │  ┌────────────────────────────────┐ │
                  │  │        Capability Manager      │ │
                  │  └────────────────┬───────────────┘ │
                  │                   │                 │
                  │  ┌────────────────▼───────────────┐ │
                  │  │          Policy Engine         │ │
                  │  └────────────────┬───────────────┘ │
                  │                   │                 │
                  │  ┌────────────────▼───────────────┐ │
                  │  │           Agent Core            │ │
                  │  └───────────┬───────────┬────────┘ │
                  │              │           │          │
                  │         Telemetry      Media       Commands
                  │              │           │          │
                  │              └─────┬─────┴──────────┘
                  │                    │
                  │             Local Event Store
                  │                    │
                  │               Sync Queue
                  └────────────────────┴─────────────────┘
```

`*` Only use transports actually available and permitted by the Android device/app.

---

# 3. Core Modules

## Android Agent

Suggested package/module structure:

```text
android-agent/
├── app/
├── core/
│   ├── security/
│   ├── networking/
│   ├── permissions/
│   ├── capability/
│   ├── policy/
│   ├── storage/
│   └── logging/
├── feature/
│   ├── pairing/
│   ├── telemetry/
│   ├── location/
│   ├── screen/
│   ├── audio/
│   ├── push-to-sound/
│   └── sync/
└── ui/
```

## Controller

```text
controller/
├── app/
├── device-management/
├── pairing/
├── capabilities/
├── telemetry/
├── location/
├── screen/
├── audio/
├── push-to-sound/
├── audit/
└── settings/
```

---

# 4. Capability Manager

Do NOT use a single `connected = true` permission model.

Every capability has its own state.

Example:

```text
LOCATION
SCREEN_CAPTURE
MICROPHONE
AUDIO_OUTPUT
DEVICE_COMMANDS
PUSH_TO_SOUND
```

Capability state:

```text
OS_PERMISSION
DEVICE_STATE
APP_POLICY
SESSION_AUTHORIZATION
FINAL_CAPABILITY_STATE
```

Example:

```text
LOCATION
├── OS permission: GRANTED
├── Device location: ENABLED
├── App policy: ALLOWED
├── Session authorization: ALLOWED
└── Capability: ACTIVE
```

The controller must never assume that authentication automatically grants every capability.

---

# 5. Security Architecture

```text
Device Identity
      ↓
Secure Key Storage
      ↓
Pairing
      ↓
Mutual Authentication
      ↓
Encrypted Transport
      ↓
Session Authorization
      ↓
Capability Authorization
      ↓
Command Validation
      ↓
Audit Log
```

Requirements:

- Unique device identity
- Public/private key pair
- Secure storage for private keys
- QR/code-based initial pairing
- Short-lived authenticated sessions
- Replay protection
- Request IDs/nonces
- Capability-level authorization
- Audit trail
- Key rotation/revocation strategy
- No plaintext sensitive data over network

Never implement:

```text
authenticated == true
    ↓
allow everything
```

---

# 6. Push-to-Sound Feature

## User requirement

The controller/monitor has a physical or UI mouse button that can be activated so that speaking triggers a sound on the authorized Android device.

Example:

```text
Controller
    ↓
Push-to-Sound button
    ↓
User speaks: "tan tan"
    ↓
Audio capture / speech handling
    ↓
Secure command
    ↓
Android Agent
    ↓
Audio output
```

## Recommended v1 behavior

Treat this as an explicit **Push-to-Sound** feature, not covert background audio.

States:

```text
IDLE
  ↓
BUTTON_PRESSED
  ↓
LISTENING
  ↓
AUDIO_RECEIVED
  ↓
SECURE_TRANSMISSION
  ↓
ANDROID_PLAYBACK
  ↓
END
```

### UX requirements

- Clear active/listening indicator on controller
- Clear active audio indicator on Android where applicable
- Button must require an intentional press/action
- Automatic timeout
- Cancel button/action
- Maximum recording duration
- Connection state shown to user
- Failed delivery shown to user
- No hidden microphone activation
- No silent background recording

### Two possible implementations

### Option A — Voice command → predefined sound

Controller recognizes a short command such as:

```text
"tan tan"
```

and sends:

```json
{
  "type": "PLAY_SOUND",
  "sound_id": "tan_tan",
  "request_id": "..."
}
```

Android plays a locally bundled/approved sound.

Advantages:

- Very low bandwidth
- Fast
- More reliable
- Easier privacy model
- No continuous audio streaming

### Option B — Push-to-Talk audio

Controller captures audio while the button is pressed and streams it to the Android device.

Advantages:

- Actual voice is heard remotely

Costs:

- More bandwidth
- More latency handling
- More complex audio pipeline
- More privacy/security considerations

Recommended roadmap:

> Build Option A first. Add Option B only if the product genuinely needs live voice playback.

---

# 7. Offline-First Architecture

Do not use a simple cache.

Use a durable event store + sync queue.

```text
Sensor / Location / Event
          ↓
     Local Event Store
          ↓
       Sync Queue
          ↓
    Network Available?
       /          \
     NO            YES
     ↓              ↓
   Queue       Upload / Sync
                   ↓
              Server ACK
                   ↓
             Mark Synced
```

Suggested event model:

```text
event_id
device_id
timestamp
event_type
payload
priority
created_at
sync_status
retry_count
```

Requirements:

- Durable local storage
- Idempotent event IDs
- Retry with exponential backoff
- ACK handling
- Deduplication
- Queue size limits
- Encryption for sensitive local data
- Expiration/retention policy

---

# 8. Transport Architecture

Prefer:

```text
LAN
 ↓
Direct authenticated connection
```

when practical.

Otherwise:

```text
Android Agent
      ↓
Secure outbound connection
      ↓
Relay/Gateway
      ↓
Controller
```

The mobile tower/network itself is NOT treated as an app-controlled emergency data channel.

Internet OFF does not necessarily mean LAN OFF.

If:

```text
Internet = OFF
LAN = ON
```

the agent and controller may still communicate locally.

If all usable communication paths are unavailable, commands must be queued/rejected rather than pretending delivery succeeded.

---

# 9. Location Architecture

Location is collected only when the relevant Android permission/capability is active.

```text
Location Provider
      ↓
Location Manager
      ↓
Policy Check
      ↓
Local Event Store
      ↓
Sync Queue
      ↓
Controller
```

The system must handle:

- Permission revoked
- Location disabled
- Background restrictions
- Battery optimization
- OEM restrictions
- GPS unavailable
- Network unavailable
- Stale location

Never claim a location was delivered unless delivery is confirmed.

---

# 10. Screen Architecture

Screen capture must use Android's supported MediaProjection model.

```text
User Consent
     ↓
Projection Session
     ↓
Capture
     ↓
Encode
     ↓
Secure Transport
     ↓
Controller
```

Do NOT design around permanent one-time MediaProjection authorization.

The system must gracefully handle session termination and reauthorization requirements.

---

# 11. Audio Architecture

Separate:

```text
MICROPHONE INPUT
```

from:

```text
AUDIO OUTPUT
```

and from:

```text
PUSH_TO_SOUND
```

The controller must never silently activate microphone functionality.

For audio capture:

- Explicit capability
- Android permission state
- Visible state
- Foreground-service rules where applicable
- Maximum session duration
- Secure transport
- No unnecessary retention

---

# 12. Policy Engine

Every sensitive action passes through policy evaluation.

```text
Incoming Command
      ↓
Authentication
      ↓
Device Pairing
      ↓
Capability Check
      ↓
Policy Check
      ↓
OS State Check
      ↓
Execute / Reject
      ↓
Audit
```

Example:

```text
PLAY_SOUND
├── Device paired? YES
├── Controller authorized? YES
├── PUSH_TO_SOUND enabled? YES
├── Audio output available? YES
└── Execute
```

---

# 13. Command Protocol

Use structured commands.

Example:

```json
{
  "version": 1,
  "request_id": "uuid",
  "device_id": "device-id",
  "type": "PLAY_SOUND",
  "timestamp": 0,
  "payload": {
    "sound_id": "tan_tan"
  }
}
```

Every command should have:

- Version
- Request ID
- Device ID
- Timestamp
- Command type
- Payload
- Authentication/integrity protection

Commands should be idempotent where practical.

---

# 14. Controller UI

Main dashboard:

```text
┌────────────────────────────────────────────┐
│ Device: My Android                         │
│ ● Online                                    │
├────────────────────────────────────────────┤
│ Location       ● Available                  │
│ Screen         ● Available                  │
│ Audio Output   ● Available                  │
│ Push-to-Sound  ● Ready                      │
├────────────────────────────────────────────┤
│                                            │
│             [ PUSH TO SOUND ]              │
│                                            │
│       Hold → Speak → Release               │
│                                            │
├────────────────────────────────────────────┤
│ Connection: LAN                            │
│ Last Sync: 19:50:21                        │
└────────────────────────────────────────────┘
```

The button should have a clear pressed/released state and should never create an ambiguous “maybe recording” state.

---

# 15. Data Storage

Use separate categories:

```text
Device Metadata
Pairing Metadata
Capability State
Events
Location Records
Command Records
Audit Records
Sync Queue
Settings
```

Sensitive data should have appropriate encryption and retention policies.

Do not store raw microphone/audio data permanently unless the product requirement explicitly requires it.

---

# 16. Reliability

Implement:

- Heartbeat
- Connection state machine
- Request timeout
- Retry policy
- Idempotency
- Offline queue
- Delivery ACK
- Reconnect
- Session renewal
- State restoration
- Crash recovery

Connection states:

```text
DISCONNECTED
CONNECTING
AUTHENTICATING
CONNECTED
DEGRADED
RECONNECTING
```

---

# 17. Observability

Include:

- Structured logs
- Crash reporting
- Performance metrics
- Connection metrics
- Command success/failure metrics
- Queue depth
- Sync latency
- Audio command latency
- Security/audit events

Never log:

- Private keys
- Authentication tokens
- Raw sensitive audio
- Sensitive location payloads unnecessarily

---

# 18. Recommended Technology Direction

Technology should be finalized after requirements validation, but a strong default is:

### Android

- Kotlin
- Jetpack
- Coroutines
- Room
- WorkManager
- Foreground Services only where justified
- Android Keystore
- Modern Android networking stack

### Controller

Choose one based on target:

- Web: React/Next.js
- Desktop: Tauri/Electron if required
- Cross-platform mobile: Flutter/React Native if appropriate

### Backend

- REST for management APIs
- WebSocket for realtime events/commands
- PostgreSQL for persistent data
- Redis only where useful for ephemeral state/queues
- Object storage for media only when required

Do not add infrastructure just because it is fashionable.

---

# 19. Development Phases

## Phase 0 — Architecture & Threat Model

- Requirements freeze
- Data-flow diagrams
- Threat model
- Permission matrix
- Capability matrix
- Protocol design

## Phase 1 — Android Foundation

- Project structure
- Device identity
- Secure storage
- Local database
- Permission manager
- Capability manager

## Phase 2 — Pairing & Networking

- QR pairing
- Authentication
- LAN discovery where appropriate
- Secure connection
- Reconnection
- Heartbeat

## Phase 3 — Controller

- Device dashboard
- Device state
- Capability state
- Audit view

## Phase 4 — Offline Sync

- Event store
- Queue
- Retry
- ACK
- Deduplication

## Phase 5 — Push-to-Sound

- Controller button
- Predefined sound protocol
- Android playback
- Delivery status
- Audit event
- Timeout/cancel behavior

## Phase 6 — Location

- Permission flow
- Collection
- Local storage
- Sync
- Controller visualization

## Phase 7 — Screen

- MediaProjection
- Session lifecycle
- Encoding
- Secure streaming
- Controller viewer

## Phase 8 — Additional Audio/Media

Only after privacy/security review.

## Phase 9 — Production Hardening

- Security testing
- Abuse testing
- Offline testing
- OEM testing
- Battery testing
- Network interruption testing
- Crash recovery
- Load testing
- Release pipeline

---

# 20. Testing Matrix

Test at minimum:

### Network

- Internet ON
- Internet OFF
- LAN only
- Network switches
- Weak connection
- Packet loss
- High latency
- Reconnect

### Android

- Permission granted
- Permission revoked
- Location disabled
- Battery saver
- Background restrictions
- App killed
- Device reboot
- Different Android versions
- Different OEMs

### Security

- Invalid pairing
- Expired session
- Replay command
- Unauthorized capability
- Revoked device
- Malformed command
- Duplicate command

### Push-to-Sound

- Button press
- Button release
- Timeout
- Cancel
- Android offline
- Android reconnect
- Audio output unavailable
- Duplicate request
- Delivery failure
- Successful playback

---

# 21. Non-Goals

The implementation must NOT:

- Bypass Android permissions
- Hide microphone activation
- Secretly record users
- Evade Android privacy indicators
- Pretend unavailable communication succeeded
- Use mobile towers as an app-controlled hidden transport
- Grant every capability after authentication
- Store sensitive media indefinitely without a justified requirement

---

# 22. Claude Code Working Rules

Claude Code should:

1. Read this architecture before modifying code.
2. Never introduce a feature that violates the security model.
3. Keep Android OS permissions separate from application capabilities.
4. Write tests for security-sensitive logic.
5. Avoid large rewrites without an architecture reason.
6. Keep modules loosely coupled.
7. Prefer interfaces around transport, storage, and capability services.
8. Make commands versioned.
9. Make network operations observable.
10. Make offline behavior deterministic.
11. Never silently downgrade security.
12. Document any architectural deviation.
13. Do not claim Android functionality that the OS does not permit.
14. Keep secrets and credentials out of source control.
15. Before implementing a new sensitive capability, update:
   - capability matrix
   - threat model
   - permission requirements
   - audit events
   - tests

---

# 23. Definition of Done

A feature is not considered complete until:

- Happy path works
- Failure path works
- Offline path is defined
- Permission denial is handled
- Authentication is enforced
- Capability authorization is enforced
- Audit event exists where appropriate
- Tests exist
- Logs are useful but privacy-safe
- UI communicates state clearly
- Android lifecycle behavior is handled
- Documentation is updated

---

# 24. First Implementation Task

Before writing feature code, Claude Code should produce:

1. Final repository structure
2. Architecture decision records
3. Threat model
4. Permission matrix
5. Capability matrix
6. Command/event protocol
7. Database schema
8. Android module skeleton
9. Controller module skeleton
10. Test strategy

Then implement the smallest vertical slice:

```text
Android Agent
     ↓
Secure Pairing
     ↓
Controller
     ↓
PLAY_SOUND command
     ↓
Android Audio Output
     ↓
ACK
     ↓
Audit Event
```

Only after this vertical slice is stable should additional capabilities be implemented.
