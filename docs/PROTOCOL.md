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
| `INPUT_COMMAND` / `INPUT_COMMAND_ACK` | Controller → Agent | §20 tap/swipe/global/text (coords normalized 0..1) |
| `LOCK_REQUEST` / `LOCK_RESPONSE` | Controller → Agent | device-admin lock (no unlock — see below) |
| `START_SCREEN`/`STOP_SCREEN`, `SCREEN_FRAME` | both dirs | §19 MediaProjection; frames are `{mime,b64}` JPEG |
| `START_CAMERA`/`STOP_CAMERA`, `CAMERA_FRAME` | both dirs | §27 Camera2 JPEG frames `{mime,b64}` |
| `START_MIC`/`STOP_MIC`, `MIC_CHUNK` | both dirs | §11 mic PCM `{pcm_b64,sample_rate}` |
| `STREAM_STATUS` | Agent → Controller | `{stream,state}` started/stopped/denied — the only stream line audited |
| `HEARTBEAT` | Both | Connection liveness, §16 |

Frame/chunk messages (`SCREEN_FRAME`/`CAMERA_FRAME`/`MIC_CHUNK`) are high-rate and are forwarded but **not** written to the audit log per-frame — only `STREAM_STATUS` start/stop is audited. Media rides base64-over-JSON for v1 (ponytail); the production upgrade is hardware encode + binary WS frames (MASTER.md §11 optimization phase).

**Not in the protocol, by design:** there is no `UNLOCK` message. Android provides no API for a third-party app to dismiss the keyguard; offering it would require a credential bypass (MASTER.md §17/§50 non-goal).

## Standard error codes

`PERMISSION_REQUIRED`, `NOT_SUPPORTED`, `DEVICE_OFFLINE`, `AUTH_FAILED`, `SESSION_EXPIRED`, `MODULE_DISABLED`, `TIMEOUT`, `ANDROID_RESTRICTION`, `NETWORK_ERROR` (MASTER.md §36).

## Connection states (§16)

`DISCONNECTED → CONNECTING → AUTHENTICATING → CONNECTED → DEGRADED → RECONNECTING`

Every message type beyond this core set gets added here — and only here — before any module implements it (MASTER.md §43 change-management rule).
