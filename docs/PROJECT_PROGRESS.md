# Project progress

## 2026-08-24 — Phase 0: repo foundation

- Repo: `Asadsk123/acount-setups`, working branch `claude/feasibility-check-timeline-f4hpk8` (repo default).
- Reconciled two prior specs into one authoritative `docs/MASTER.md`: the user-supplied platform spec + the earlier `CLAUDE_CODE_ARCHITECTURE.md` review (kept as reference, Push-to-Sound folded in as its own module).
- Resolved the 3 blockers `FEASIBILITY_AND_ESTIMATE.md` flagged as must-decide-before-Phase-1: see `docs/adr/ADR-0001` (distribution: sideload/direct APK, self/family devices), `ADR-0002` (push wakeup: FCM primary, foreground-service fallback), `ADR-0003` (replay protection: nonce+seq, not timestamp window). Push-to-Sound spec captured as `ADR-0004`.
- Added `docs/PROTOCOL.md` (message envelope + v1 message types) and `docs/CAPABILITY_MATRIX.md` (4-layer capability model).
- Controller tech decided: local web UI (React/Next.js) — MASTER.md §51 updated.
- Not started yet: repo module skeleton (android-agent/, controller/, protocol/, relay-server/, shared/), any actual code, Phase 1.

**Next:** build the thin vertical slice recommended in FEASIBILITY_AND_ESTIMATE.md §7 — pair → PLAY_SOUND → ACK → audit — before any other module.

## 2026-08-24 — vertical slice built, 2/3 pieces verified

- `relay-server/`: pairing (PIN + HMAC session token), PLAY_SOUND routing, audit log. Verified with
  `test_vertical_slice.js` (automated) — happy path + rejected wrong PIN + rejected forged token.
  Found and fixed a real bug during testing: agent couldn't authenticate before a controller claimed
  the pairing code (secret was only stored on `PAIR_REQUEST`, not `PAIR_INIT`).
- `controller/`: static-page web UI (plain HTML/JS, not Next.js — see inline note in
  `controller/server.js` for why). Verified live in-browser: entered a real pairing code, pressed
  Push to Sound, watched the audit log update in real time against the running relay.
- `android-agent/`: full Kotlin/Gradle project written (pairing UI, OkHttp WebSocket client,
  MediaPlayer sound playback, matches PROTOCOL.md). **Not yet compiled** — this machine's Java/Gradle
  cannot open its internal loopback IPC socket (`Unable to establish loopback connection`,
  `UnixDomainSockets.connect` → `Invalid argument`). Confirmed this is not a code issue: reproduced
  identically across 3 JDK builds (17.0.8, 17.0.13, 21.0.5), 2 process-spawning tools (Bash and
  PowerShell), and with the calling tool's own sandbox explicitly disabled — the restriction persists
  regardless, so it's specific to how this automated session spawns processes, not the project or the
  physical machine in general. `android-agent/build.bat` has everything wired up (JDK/SDK/Gradle
  already downloaded to `C:\Android`) for the operator to run directly in their own terminal, where it
  should build normally.
- `relay-server/fake_agent.js`: stand-in agent for testing the controller without a phone.
