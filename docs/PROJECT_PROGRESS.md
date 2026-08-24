# Project progress

## 2026-08-24 — Phase 0: repo foundation

- Repo: `Asadsk123/acount-setups`, working branch `claude/feasibility-check-timeline-f4hpk8` (repo default).
- Reconciled two prior specs into one authoritative `docs/MASTER.md`: the user-supplied platform spec + the earlier `CLAUDE_CODE_ARCHITECTURE.md` review (kept as reference, Push-to-Sound folded in as its own module).
- Resolved the 3 blockers `FEASIBILITY_AND_ESTIMATE.md` flagged as must-decide-before-Phase-1: see `docs/adr/ADR-0001` (distribution: sideload/direct APK, self/family devices), `ADR-0002` (push wakeup: FCM primary, foreground-service fallback), `ADR-0003` (replay protection: nonce+seq, not timestamp window). Push-to-Sound spec captured as `ADR-0004`.
- Added `docs/PROTOCOL.md` (message envelope + v1 message types) and `docs/CAPABILITY_MATRIX.md` (4-layer capability model).
- Controller tech decided: local web UI (React/Next.js) — MASTER.md §51 updated.
- Not started yet: repo module skeleton (android-agent/, controller/, protocol/, relay-server/, shared/), any actual code, Phase 1.

**Next:** build the thin vertical slice recommended in FEASIBILITY_AND_ESTIMATE.md §7 — pair → PLAY_SOUND → ACK → audit — before any other module.
