# Feasibility Check, Timeline & Token Estimate
## Android Agent + Controller — Architecture v1.0

> Reviewed document: `CLAUDE_CODE_ARCHITECTURE.md`
> Review date: 2026-08-19
> Verdict: **Buildable — with 3 hard blockers to resolve before Phase 1.**

---

## 0. Summary (Roman Urdu)

- Architecture **theek hai**. Security model, capability model aur offline design
  professional level ka hai. Yeh koi "spy app" spec nahi — permissions honestly
  handle kiye gaye hain, isliye implement karna legal aur technically possible hai.
- Lekin **3 cheezein missing hain** jo Phase 1 se pehle decide karni hongi:
  push wakeup (FCM), distribution model (Play Store policy), aur time-sync for
  replay protection. Details Section 3 mein.
- **Time:** poora scope (Phase 0–9) = **5–6 mahine** agar 1 developer + Claude Code.
  2–3 developers ho to **3–3.5 mahine**. Sirf MVP (Phase 0–5) = **8–10 hafte**.
- **Tokens:** poora scope **~85M–140M tokens**. MVP **~40M–55M**. Pehla chhota
  vertical slice (jo doc ke Section 24 mein likha hai) **~8M–12M**.
- Sabse mushkil hissa: **Phase 7 (screen capture)** — is mein sabse zyada time,
  tokens aur real-device testing lagega.

---

## 1. What the architecture gets right

| Area | Assessment |
|---|---|
| Capability model (§4) | Strong. Separating OS permission / device state / app policy / session auth is the correct model and avoids the classic `authenticated == allow everything` bug. |
| Security chain (§5) | Correct ordering. Pairing → mutual auth → session → capability → command validation → audit is industry-standard. |
| Offline-first (§7) | Correct. Durable event store + sync queue with idempotent IDs, not a cache. Directly maps to Room + WorkManager. |
| Push-to-Sound (§6) | Option A first is the right call. Predefined-sound protocol removes the entire audio-streaming pipeline from v1. |
| Non-goals (§21) | This section is what makes the project shippable. It rules out the behaviors that would otherwise get it classified as stalkerware. |
| Phasing (§19) | Realistic ordering. Screen capture correctly placed late. |

The document is implementable as written. The estimates below assume it is
followed, not rewritten.

---

## 2. Effort model — assumptions behind the numbers

These numbers are not guesses pulled from nothing; they are derived from
estimated code volume.

**Assumed output volume (production code + tests, excluding generated files):**

| Component | Est. LOC |
|---|---|
| Android agent (Kotlin) | ~12,000 |
| Controller (React/Next.js) | ~7,500 |
| Backend / relay (REST + WebSocket) | ~5,500 |
| Tests (all three) | ~7,000 |
| Docs, ADRs, schema, protocol spec | ~4,000 |
| **Total** | **~36,000** |

**Token conversion factor used:** in agentic sessions, delivered production code
costs roughly **2,000–4,000 total tokens per line** once you count context
re-sent each turn, file reads, failed attempts, test-fix loops, and cache reads.
Docs and boilerplate sit at the low end; concurrency, crypto and media pipelines
sit at the high end or above it.

Time assumes **one developer driving Claude Code full-time**, including code
review, real-device testing, and debugging that cannot be delegated.

---

## 3. Blockers — resolve these before Phase 1

### 3.1 No push wakeup path is specified — **must fix**

The architecture (§8) assumes the agent holds an outbound connection to the
relay. Android will not honor that assumption: under Doze and App Standby the
socket is torn down, and a killed or rebooted app has no connection at all.

`PLAY_SOUND` therefore cannot be delivered to an idle device using only the
design in §8. **FCM high-priority messages are required** as the wakeup channel,
with the socket used only once the app is awake.

This is missing from §8, §13 and §16 and changes the transport design. Decide
before Phase 2 — retrofitting it later means reworking the connection state
machine.

Follow-on decision: FCM implies a Google dependency and a server-side FCM key.
If the product must run without Google Play Services, the only alternative is a
persistent foreground service with a visible notification, which changes UX and
battery behaviour significantly.

### 3.2 Distribution model is undefined — **must decide**

The feature set — background location + screen capture + remote audio output on
another person's device — sits directly against Google Play's Stalkerware and
Device & Network Abuse policies, regardless of how honestly it is implemented.

Three viable paths, pick one now because it changes the code:

1. **Self/parent-device model** — user pairs their *own* devices. Cleanest, Play
   Store viable, requires the onboarding flow to prove same-user ownership.
2. **Enterprise / MDM** — distribute via managed Play or Device Owner
   provisioning. Unlocks far more capability with fewer consent prompts, but
   requires enrolment tooling.
3. **Sideload / internal distribution** — no store review, no store reach, and
   no update channel unless you build one.

The architecture is currently written path-agnostic. It cannot stay that way
past Phase 1: pairing UX, consent copy, and the permission set all depend on it.

### 3.3 Replay protection has no clock-skew strategy — **should fix**

§5 requires replay protection and §13 puts a `timestamp` in every command, but
nothing defines the accepted time window or what happens when the device clock
is wrong (common after reboot, and user-settable). A pure timestamp window will
produce false rejections in the field.

Recommendation: server-issued nonce + monotonic per-session sequence number,
with the timestamp used for audit only, not for validation.

### 3.4 Smaller gaps (not blockers, but close them in Phase 0)

- **Key rotation** is listed as a requirement (§5) with no mechanism. Needs a
  concrete flow: who initiates, how the old key is retired, what happens to
  queued events signed with it.
- **Multi-controller / multi-device** is never addressed. One device to many
  controllers? One controller to many devices? Affects the database schema, so
  decide before Phase 1 writes it.
- **Relay auth model** is unspecified (§8). The relay sits between two
  authenticated parties — is it trusted, or is the payload end-to-end encrypted
  past it? This is a threat-model answer, and it belongs in Phase 0.
- **Queue size limits and retention** (§7, §15) have no numbers. Pick them in
  Phase 0; they are schema-affecting.

---

## 4. Phase-by-phase estimate

Solo developer + Claude Code. Token figures are total (input + output + cache reads).

| Phase | Scope | Est. LOC | Time | Tokens |
|---|---|---|---|---|
| **0** — Architecture & threat model | ADRs, threat model, permission + capability matrix, protocol spec, DB schema, repo structure | ~4,000 (docs) | 1 wk | **4M – 7M** |
| **1** — Android foundation | Project structure, device identity, Keystore, Room DB, permission manager, capability manager | ~3,000 | 2 wk | **8M – 13M** |
| **2** — Pairing & networking | QR pairing, mutual auth, WebSocket, relay backend, reconnect, heartbeat, FCM wakeup | ~4,500 | 3 wk | **13M – 21M** |
| **3** — Controller | Dashboard, device state, capability display, audit view | ~3,000 | 2 wk | **8M – 13M** |
| **4** — Offline sync | Event store, queue, retry/backoff, ACK, dedup | ~2,000 | 1.5 wk | **6M – 10M** |
| **5** — Push-to-Sound (Option A) | Button, PLAY_SOUND protocol, playback, delivery status, audit, timeout/cancel | ~1,500 | 1 wk | **4M – 7M** |
| **6** — Location | Permission flow, collection, storage, sync, map view | ~2,000 | 1.5 wk | **6M – 10M** |
| **7** — Screen | MediaProjection, session lifecycle, encode, stream, viewer | ~3,500 | 3 wk | **13M – 22M** |
| **8** — Audio (mic / Option B) | Capture, foreground service, streaming, consent UI | ~2,500 | 2 wk | **8M – 14M** |
| **9** — Production hardening | Security + abuse + offline + OEM + battery testing, load test, crash recovery, CI/CD | ~7,000 (mostly tests) | 4 wk | **15M – 25M** |
| | | **~33,000** | **21 wk** | **85M – 142M** |

### Scope options

| Option | Phases | Time | Tokens |
|---|---|---|---|
| **Thin vertical slice** (doc §24: pair → PLAY_SOUND → ACK → audit) | 0 + minimal 1, 2, 5 | 1.5 – 2 wk | **8M – 12M** |
| **MVP** (usable product, no screen/mic) | 0 – 6 | 8 – 10 wk | **40M – 55M** |
| **Full scope** | 0 – 9 | ~21 wk (5 mo) | **85M – 142M** |
| **Full scope, 3 devs in parallel** | 0 – 9 | ~12 wk (3 mo) | same tokens, more sessions |

Team size cuts calendar time but not tokens — the same code has to be written
either way.

---

## 5. Where the estimate is most likely to be wrong

Ranked by risk of overrun:

1. **Phase 7 (Screen), +50–100% risk.** Video encoding + streaming is the least
   predictable work in the plan. MediaProjection consent behaviour changed in
   Android 14 and again in 15; latency tuning across real networks is empirical,
   not something that can be reasoned out in advance. If a phase blows past its
   estimate, it will be this one.
2. **Phase 9 (Hardening), +40% risk.** OEM behaviour (Xiaomi, Samsung, Oppo,
   Vivo aggressive process killing) cannot be discovered without physical
   devices. Budget for surprises here, not for a clean run.
3. **Phase 2 (Pairing), +30% risk.** Crypto and connection-state bugs are slow
   to find. This is also the phase where blocker 3.1 lands if it is not resolved
   in Phase 0.
4. **Phases 0, 3, 4, 5, 6** are well-understood work and should land close to
   estimate.

---

## 6. What Claude Code cannot do here

Plan around these — they are the human-only line items and they are already
inside the time estimates above, but not inside the token estimates.

- **Real-device testing.** No physical Android hardware in the loop. Emulator
  covers logic; it does not cover OEM process killing, real GPS drift, battery
  behaviour, or MediaProjection on a real screen.
- **Play Store submission and policy review.** Including any appeal.
- **Google account / FCM project setup**, signing keys, Play Console.
- **The privacy and legal decision** in blocker 3.2. This is a product call, not
  an engineering one.
- **Field network testing** — real cellular handoff, real packet loss.

Rough split: expect **~70% of calendar time** to be Claude-assisted development
and **~30%** human testing, review, and setup that consumes no tokens.

---

## 7. Recommended starting sequence

Do not start at Phase 1. Start here:

1. **Answer blocker 3.2** (distribution model). One decision, one afternoon,
   and it constrains everything downstream.
2. **Answer blocker 3.1** (FCM or foreground service). Determines the transport
   design in Phase 2.
3. **Run Phase 0** as written in §24 of the architecture — but add the four
   §3.4 gaps to its deliverable list.
4. **Build the thin vertical slice** (pair → `PLAY_SOUND` → ACK → audit) before
   anything else. ~8M–12M tokens, ~2 weeks. It proves the pairing, transport,
   policy engine, and audit path end to end on the smallest possible feature.
5. Only then continue phase by phase.

If the vertical slice takes materially longer than 2 weeks, re-estimate
everything below it before continuing — that slice is the calibration point for
the whole plan.

---

## 8. Bottom line

The architecture is sound and does not need rewriting. The three blockers in
Section 3 are decisions, not defects — but they are schema- and
transport-affecting, so they have to be made before Phase 1 writes code.

- **Full scope:** ~5 months solo, ~85M–142M tokens.
- **MVP (no screen/mic):** ~8–10 weeks, ~40M–55M tokens.
- **Start with:** the ~2-week, ~10M-token vertical slice.
