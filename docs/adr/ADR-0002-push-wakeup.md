# ADR-0002: Push wakeup for an idle/killed agent

**Status:** Decided (default), override available

## Problem

The architecture assumes the agent holds an outbound connection to the relay/controller. Android will not honor that assumption under Doze/App Standby — the socket gets torn down, and a killed or rebooted app has no connection at all. A command like `PLAY_SOUND` cannot reach an idle device without a wakeup channel.

## Decision

**FCM (Firebase Cloud Messaging) high-priority data messages** as the primary wakeup channel. The agent wakes on the FCM message, opens the socket, receives/executes the queued command, then lets the socket idle out again.

## Why

- MASTER.md §46 already directs the project toward "OS-supported background mechanisms" over keeping the process alive — FCM is exactly that.
- It's the standard, well-tested path for this exact problem; a persistent foreground service is the alternative and it means a permanent visible notification and worse battery behavior, which conflicts with §46 and the "minimum data consumption" principle (§3.4).

## Consequences

- Adds a Google Play Services dependency and a server-side FCM key. This is an explicit tradeoff, not a hidden one.
- **Fallback for devices without Google Play Services:** persistent foreground service with a visible notification. Implement as a capability flag (`push_wakeup = FCM | FOREGROUND_SERVICE`) so the agent can pick per-device rather than assuming Google Play Services is always present — consistent with §7's capability-registry pattern.
- If the operator later decides Google dependency is unacceptable, flip the default in this ADR and switch the transport design in Phase 2 — decide before Phase 2 code is written, not after (retrofitting later means reworking the connection state machine).
