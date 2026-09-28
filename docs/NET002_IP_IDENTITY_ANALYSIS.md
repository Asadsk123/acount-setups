# NET-002: IP / Device Identity — Requirement Analysis

## Original requirement (as stated)

> Stable DEVICE_ID (UUID) that survives restarts/updates

The requirement was labelled "remove Wi-Fi IP dependency" (NET-001) and "stable DEVICE_ID" (NET-002).
The combination implies: **do not use the phone's current network IP as the device's identity**.

---

## What Android can and cannot guarantee

| Claim | Verdict |
|-------|---------|
| Android can assign a permanently fixed Wi-Fi/DHCP IP | **FALSE** — DHCP leases expire; routers re-assign IPs; hotspot/mobile-data changes IP on every connection |
| Android can assign a permanently fixed carrier/SIM IP | **FALSE** — mobile IPs are dynamic by design (CGNAT, handover) |
| Android can maintain a stable UUID in app-private storage across restarts/updates | **TRUE** — SharedPreferences in `MODE_PRIVATE` persist through APK updates, reboots, and process death |
| Android wipes SharedPreferences on uninstall | **TRUE** — this is the correct reset point |

**Conclusion:** A "stable IP" requirement is technically impossible on Android. The implementable requirement is a **stable UUID persisted in app-private storage**, used as the device's identity for all relay authentication.

---

## Original requirement vs implementable part

| Aspect | Original requirement | Implementable part | Status |
|--------|---------------------|-------------------|--------|
| Stable identity across restarts | UUID survives restart | UUID in SharedPreferences survives restart | DESIGN-VERIFIED |
| Stable identity across updates | UUID survives APK update | SharedPreferences persist through `adb install -r` | DESIGN-VERIFIED |
| Stable identity across reboots | UUID survives reboot | SharedPreferences persist through reboot | DESIGN-VERIFIED |
| Stable identity across Wi-Fi changes | UUID survives network change | UUID is never derived from IP — network change does not affect it | DESIGN-VERIFIED |
| Stable identity across mobile-data switch | UUID survives network change | Same as above — UUID is storage-based, not IP-based | DESIGN-VERIFIED |
| Permanent network IP | Fixed IP so relay can find device | **IMPOSSIBLE** — relay finds device by DEVICE_ID in authenticated WebSocket, not by IP | BLOCKED (by design — correct architecture) |
| Reset only on uninstall / data clear | UUID regenerates fresh | Uninstall wipes SharedPreferences; adb install -r keeps them | DESIGN-VERIFIED |

---

## Current implementation

**File:** `android-agent/app/src/main/java/com/hrapp/agent/Agent.kt`

```kotlin
// Line 190-196
private fun stableDeviceId(): String {
    val prefs = appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
    var id = prefs.getString("device_id", null)
    if (id == null) {
        id = UUID.randomUUID().toString()
        prefs.edit().putString("device_id", id).apply()
    }
    return id
}
```

- `UUID.randomUUID()` — uses `SecureRandom` internally (Android's `java.util.UUID`)
- Persisted in `MODE_PRIVATE` SharedPreferences under key `device_id` in pref file `agent_config`
- Called exactly once: in `sendPairInit()` — only when no existing `device_id` is stored
- On reconnect: `onOpen()` reads stored `device_id` first and goes to re-auth path, **never calling `stableDeviceId()` again**
- `setRelayHost()` sets `deviceId = null` in memory but does NOT clear the SharedPreferences `device_id` — next `onOpen()` reads it back from storage

**One issue:** `setRelayHost()` sets `deviceId = null`:
```kotlin
fun setRelayHost(host: String) {
    ...
    deviceId = null        // clears in-memory copy
    lastPairingCode = null
    connect()
}
```
This is safe: `connect()` → `onOpen()` → reads `device_id` from SharedPreferences → re-auth path. The UUID is **not lost**.

**Architecture:** Device is identified by `DEVICE_ID` in the WebSocket AUTH_REQUEST, not by IP. The relay maps `"${device_id}:agent"` → socket. When the phone's IP changes (Wi-Fi → mobile, DHCP renewal), the WebSocket drops, the agent reconnects from the new IP, and re-authenticates with the same `DEVICE_ID`. The relay updates the socket reference — identity is preserved, pairing is preserved.

---

## What is NOT implemented (and must NOT be claimed)

| Item | Status |
|------|--------|
| Android Keystore storage for DEVICE_ID | NOT IMPLEMENTED — UUID is in SharedPreferences (sufficient for sideloaded dev build; Keystore adds hardware-backed tamper resistance for production) |
| Attestation that DEVICE_ID was generated on this specific hardware | NOT IMPLEMENTED |
| Cryptographic binding of DEVICE_ID to device hardware | NOT IMPLEMENTED |

SharedPreferences is **sufficient for HRAPP's stated use case** (personal/family monitoring with direct physical access to the device). Keystore is the upgrade path if tamper-resistance becomes a requirement.

---

## Real-device verification required (NET-002)

All tests below are **NOT VERIFIED** until POCO X7 evidence exists.

| Test | Procedure | Expected | Status |
|------|-----------|----------|--------|
| A | Fresh install → record DEVICE_ID in diagnostic screen | UUID generated, displayed | NOT VERIFIED |
| B | Close/reopen app → read DEVICE_ID | Identical to Test A | NOT VERIFIED |
| C | Reboot phone → read DEVICE_ID | Identical to Test A | NOT VERIFIED |
| D | Toggle Wi-Fi off+on → read DEVICE_ID | Identical; IP may change | NOT VERIFIED |
| E | Change network (Wi-Fi → mobile or vice versa) → read DEVICE_ID | DEVICE_ID identical; current_ip changed | NOT VERIFIED |
| F | `adb install -r` (APK update) → read DEVICE_ID | Identical to Test A | NOT VERIFIED |
| G | Uninstall + reinstall → read DEVICE_ID | NEW UUID generated | NOT VERIFIED |
| H | Network change mid-session: pair on IP=A, network changes to IP=B, reconnect → pairing still valid | Same DEVICE_ID, relay re-auths, controller can still send commands | NOT VERIFIED |

**Logcat evidence needed:**
```
adb logcat -s HRAPP | grep -E "device_id|DEVICE_ID|stableDeviceId|onOpen"
```
Expected on reconnect:
```
onOpen: stored device_id=6413f8db...     ← reads from storage, not generated fresh
onOpen: re-auth path — sending AUTH_REQUEST
AUTH_RESPONSE: OK
```
Expected on fresh install only:
```
onOpen: stored device_id=null
sendPairInit: device_id=<new-uuid>       ← generated once
```

---

## Diagnostic screen (to be added — see implementation below)

The diagnostic screen will show on the phone:
```
DEVICE IDENTITY
  DEVICE_ID: 6413f8db-6aa0-46f5-a1e8-6eedd911e915  (stable, storage-persisted)
  note: DEVICE_ID never changes with network — only on fresh install or data clear

NETWORK (dynamic — changes with Wi-Fi/mobile/hotspot)
  transport: Wi-Fi
  current IP: 192.168.0.105  (dynamic — DO NOT use as identity)
  relay: 192.168.0.246:8787

CONNECTION
  state: AUTHENTICATED
```

This makes the stable-vs-dynamic distinction explicit and visible on the device.

---

## Summary

| | |
|---|---|
| **Original requirement** | Stable device identity that does not rely on dynamic Wi-Fi/carrier IP |
| **Technically implementable part** | UUID in app-private SharedPreferences, persisted across restarts/updates/reboots, reset only on uninstall |
| **Current implementation** | `UUID.randomUUID()` in SharedPreferences (`MODE_PRIVATE`), generated once on first pair, re-read on every reconnect — CORRECT architecture |
| **Real device test** | NOT VERIFIED — all 8 tests (A–H) require POCO X7 evidence |
| **Remaining limitation** | Not hardware-backed (Keystore) — acceptable for dev sideload, upgrade path for production |
| **Status** | **NOT VERIFIED** (implementation is correct by code analysis; no device evidence yet) |
