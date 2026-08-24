# ADR-0004: Push-to-Sound module

**Status:** Decided (folded in from earlier architecture review — `CLAUDE_CODE_ARCHITECTURE.md` §6)

## Decision

Ship Push-to-Sound as its own module (MASTER.md §2.3), **Option A only for v1**: controller sends a `PLAY_SOUND` command with a `sound_id`; the Android agent plays a locally bundled sound. No live audio streaming (Option B) in v1.

## Protocol

```json
{
  "version": 1,
  "request_id": "uuid",
  "device_id": "device-id",
  "type": "PLAY_SOUND",
  "timestamp": 0,
  "payload": { "sound_id": "tan_tan" }
}
```

## State machine

```text
IDLE → BUTTON_PRESSED → SECURE_TRANSMISSION → ANDROID_PLAYBACK → END
```

(Simplified from the original LISTENING/AUDIO_RECEIVED states — those only apply to Option B, which is out of scope for v1.)

## Policy check (every command, per MASTER.md §12-equivalent policy engine)

```text
PLAY_SOUND
├── Device paired? YES
├── Controller authorized? YES
├── push_to_sound capability enabled? YES
├── Audio output available? YES
└── Execute → audit event
```

## Why Option A first

- No continuous audio streaming pipeline needed — far lower bandwidth, lower latency, simpler privacy model, no microphone involvement at all.
- Matches MASTER.md §11 (data efficiency) and §3.4 non-goal boundary (no hidden/covert audio capture).
- Option B (live push-to-talk) is deferred to Phase 9 (Future Modules) alongside camera/microphone/calling, and only if the product genuinely needs live voice rather than a locator sound.

## UX requirements (carried over, still binding)

- Clear pressed/released button state on controller, no ambiguous "maybe sending" state.
- Delivery status and failure shown to the operator.
- Timeout and cancel behavior defined.
- Every PLAY_SOUND event produces an audit record (who, when, delivered/failed).
