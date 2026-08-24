# Protocol v1

Every message — request, response, or event — shares this envelope.

```json
{
  "protocol_version": 1,
  "message_type": "STRING",
  "request_id": "uuid",
  "device_id": "device-id",
  "session_id": "uuid",
  "seq": 0,
  "timestamp": 0,
  "payload": {},
  "status": "OK | ERROR (responses only)",
  "error_code": "STRING (only when status = ERROR)"
}
```

- `seq` and `session_id` are what replay protection actually checks (ADR-0003) — `timestamp` is audit-only.
- Unknown fields must be ignored by receivers, not rejected — this is what makes future protocol versions non-breaking (MASTER.md §15).
- The controller must never send a command for a module the agent didn't advertise via `CAPABILITY_RESPONSE`.

## Core message types (v1)

| message_type | Direction | Purpose |
|---|---|---|
| `PAIR_REQUEST` / `PAIR_RESPONSE` | Controller ↔ Agent | Initial QR/PIN pairing, key exchange |
| `AUTH_REQUEST` / `AUTH_RESPONSE` | Controller → Agent | Session authentication using paired keys |
| `CAPABILITY_REQUEST` / `CAPABILITY_RESPONSE` | Controller ↔ Agent | Feature discovery (§7) |
| `DEVICE_INFO_REQUEST` / `DEVICE_INFO_RESPONSE` | Controller → Agent | §26 |
| `PLAY_SOUND` / `PLAY_SOUND_ACK` | Controller → Agent | ADR-0004 |
| `LOCATION_EVENT` | Agent → Controller | §21, pushed or polled |
| `HEARTBEAT` | Both | Connection liveness, §16 |

## Standard error codes

`PERMISSION_REQUIRED`, `NOT_SUPPORTED`, `DEVICE_OFFLINE`, `AUTH_FAILED`, `SESSION_EXPIRED`, `MODULE_DISABLED`, `TIMEOUT`, `ANDROID_RESTRICTION`, `NETWORK_ERROR` (MASTER.md §36).

## Connection states (§16)

`DISCONNECTED → CONNECTING → AUTHENTICATING → CONNECTED → DEGRADED → RECONNECTING`

Every message type beyond this core set gets added here — and only here — before any module implements it (MASTER.md §43 change-management rule).
