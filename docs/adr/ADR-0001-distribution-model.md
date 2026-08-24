# ADR-0001: Distribution model

**Status:** Decided

## Decision

Sideload / direct APK distribution. Self- or family-paired devices only (operator owns the phone, or has explicit family authority over it — confirmed with operator 2026-08-24). No Play Store submission for v1.

## Why

- MASTER.md §48 already specifies direct APK distribution as the v1 model.
- The feature set (background location, screen capture, remote audio playback on a paired device) sits close to Google Play's Stalkerware / Device & Network Abuse policy even when implemented honestly. Avoiding Play Store for v1 sidesteps that review risk entirely rather than trying to word around it.
- Self/family-device pairing keeps the consent model simple: pairing UX just needs to show what's being enabled, not prove third-party consent to a store reviewer.

## Consequences

- No Play Store distribution channel → no automatic updates via Play; need `Build → Sign → Checksum → Upload → Download link` (MASTER.md §48) as the update path.
- APK must be signed consistently across releases so updates install over the previous version.
- Android will show an "install from unknown source" prompt — expected, not a bug to route around.
- If a future requirement needs Play Store distribution (e.g. enterprise/MDM path), revisit this ADR — it changes pairing UX, consent copy, and possibly which capabilities can ship at all.
