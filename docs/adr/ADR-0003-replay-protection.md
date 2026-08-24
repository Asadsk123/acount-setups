# ADR-0003: Replay protection / clock skew

**Status:** Decided

## Problem

MASTER.md §17 requires replay protection; §14 puts a `timestamp` on every request. A pure timestamp-window check produces false rejections in the field — device clocks drift, and are commonly wrong right after a reboot or when the user changes them manually.

## Decision

Server-issued nonce + monotonic per-session sequence number is the source of truth for replay rejection. `timestamp` stays on every message for audit/logging only — it is never used to accept or reject a request.

## Flow

1. On session start, controller/relay issues a session nonce.
2. Each request carries `{ session_id, seq, nonce_derived_from_seq }`.
3. Receiver rejects any `seq` not strictly greater than the last accepted `seq` for that session.
4. `timestamp` is recorded in the audit log alongside the request but plays no role in accept/reject.

## Consequences

- No dependency on synchronized clocks between phone, controller, and relay.
- Session state must track "last accepted seq" per active session — small addition to the connection-state machine already required by §16.
- A session that goes offline and resumes needs a defined reconnect rule: either resume the old `seq` counter or start a fresh session (new nonce, `seq` reset to 0). Recommend: fresh session on reconnect — simpler, avoids seq-gap ambiguity after an offline queue flush.
