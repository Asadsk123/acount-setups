# TASK-01: POCO X7 Real-Device Verification Checklist

**Device:** POCO X7 (device_id: `6413f8db-6aa0-46f5-a1e8-6eedd911e915`)
**APK:** v12 (versionCode=12) installed as UPDATE over existing app — do NOT uninstall first
**Relay:** running on PC at `192.168.0.246:8787`

---

## Pre-requisites

- [ ] Relay is running on PC: `cd C:\PROJECTS\HRAPP\relay-server && node server.js`
- [ ] PC and phone on same Wi-Fi
- [ ] ADB connected: `adb devices` shows device
- [ ] Logcat filter ready: `adb logcat -s HRAPP`
- [ ] Install as update: `adb install -r hrapp-remote.apk`
  - **MUST NOT uninstall first** (would reset DEVICE_ID and pairing)

---

## A. T&C onboarding (SETUP-001)

### A1. Update preservation
1. Install v12 over existing install
2. Open app
3. **Expected:** T&C dialog does NOT appear (already accepted from prior install)
4. **Evidence needed:** logcat shows `startMainFlow()` called directly, no `showTermsDialog`
5. **Status:** NOT VERIFIED

### A2. First-install flow (separate test, fresh data only)
> Only run this after confirming A1. Use `adb shell pm clear com.hrapp.agent` to simulate fresh.
1. Clear app data: `adb shell pm clear com.hrapp.agent`
2. Open app
3. **Expected:** T&C dialog appears with "I Agree" / "Decline" buttons
4. Tap **Decline** → **Expected:** app closes
5. Reopen app → **Expected:** T&C appears again
6. Tap **I Agree** → **Expected:** main UI appears, pairing flow starts
7. **Evidence needed:** screenshot of dialog + logcat confirming `acceptTerms()` called
8. **Status:** NOT VERIFIED

### A3. Terms-version re-consent (code path only — do not bump version in prod)
- Logic: `needsTerms()` returns `termsVersion < CURRENT_TERMS_VERSION`
- Currently: stored=1, CURRENT=1 → no re-prompt on update ✓ (design-verified, not device-verified)
- Re-consent trigger: change `CURRENT_TERMS_VERSION` to 2 in SetupManager.kt
- **Status:** DESIGN-VERIFIED / NOT VERIFIED on device

---

## B. Connection state machine (NET-001, PAIR-001..006)

Run `adb logcat -s HRAPP` before opening app. Expected sequence:

```
STATE: DISCONNECTED → CONNECTING          [gen=1]
onOpen: gen=1 WS_OPEN
STATE: CONNECTING → WS_OPEN              [gen=1]
onOpen: stored device_id=6413f8db...
STATE: WS_OPEN → AUTHENTICATING          [gen=1]
```

**Then one of two paths:**

### B1. Re-auth path (device already paired — expected for update install)
```
onOpen: have device_id — attempting re-auth
STATE: WS_OPEN → AUTHENTICATING
AUTH_RESPONSE: OK — agent registered
STATE: AUTHENTICATING → AUTHENTICATED
CAPABILITY_RESPONSE sent
```
- **Expected on screen:** status bar shows `HRAPP [AUTHENTICATED]`
- **Expected pairing code:** NOT shown (already paired — code only shown for new pair)
- **Status:** NOT VERIFIED

### B2. New-pair path (if data was cleared or first install)
```
onOpen: new-pair path — sending PAIR_INIT
PAIR_INIT_RESPONSE: device_id=... code=XXXXXX
STATE: AUTHENTICATING → PAIRING_REQUIRED
AUTH_RESPONSE: OK
STATE: PAIRING_REQUIRED → AUTHENTICATED
```
- **Expected on screen:** 6-digit pairing code displayed large
- **Status:** NOT VERIFIED

### B3. Pairing code rules (PAIR-002)
- Record timestamp when code appears
- Check relay log: `PAIR_INIT_RESPONSE` includes `expiresAt`
- Verify expiry = 10 minutes from issue time
  ```bash
  # On PC, relay stdout shows: "PAIR_INIT code=XXXXXX expires=..."
  ```
- **Status:** NOT VERIFIED

---

## C. Persistent pairing (PAIR-003..006)

Each sub-test must show device_id `6413f8db` re-authenticating WITHOUT a new code.

### C1. App restart
1. Force-stop app: `adb shell am force-stop com.hrapp.agent`
2. Reopen app
3. **Expected logcat:** `have device_id — attempting re-auth` → AUTH_RESPONSE OK
4. **Status:** NOT VERIFIED

### C2. Android process death (background kill)
1. Send app to background
2. `adb shell am kill com.hrapp.agent`
3. Reopen app
4. **Expected:** same as C1
5. **Status:** NOT VERIFIED

### C3. Phone reboot
1. `adb reboot`
2. Wait for boot complete
3. Open app (or BootReceiver auto-starts ConnectionService)
4. **Expected logcat:** `BootReceiver: BOOT_COMPLETED — starting ConnectionService` → re-auth → AUTH_RESPONSE OK
5. **Status:** NOT VERIFIED

### C4. Temporary network loss
1. Toggle Wi-Fi off on phone (30 seconds)
2. Toggle Wi-Fi back on
3. **Expected logcat:** `onClosed/onFailure` → `scheduleReconnect gen=N delay=2000ms` → eventual reconnect → AUTH OK
4. **Status:** NOT VERIFIED

### C5. Relay restart
1. Kill relay on PC: `Ctrl+C`
2. Restart relay: `node server.js`
3. **Expected:** agent reconnects, re-auths with saved session token → AUTH OK (paired-devices.json preserved pairing)
4. **Status:** NOT VERIFIED

---

## D. Exponential backoff (Phase G)

Force connection failure (relay stopped) and time the retries:

1. Stop relay on PC
2. Watch logcat for reconnect schedule messages:
   ```
   reconnect scheduled: gen=N delay=2000ms (next=4000ms)
   reconnect scheduled: gen=N delay=4000ms (next=8000ms)
   reconnect scheduled: gen=N delay=8000ms (next=16000ms)
   ...
   reconnect scheduled: gen=N delay=58000ms (next=60000ms)  ← cap hit
   ```
3. Record actual timestamps between attempts
4. Restart relay — confirm next AUTH_RESPONSE resets `retryDelayMs` back to 2000ms
5. **Status:** NOT VERIFIED

---

## E. Pairing code display

1. Clear app data to force new-pair path
2. Open app, tap I Agree
3. Enter relay host, tap Connect
4. **Expected:** 6-digit code shown in `pairingCodeText` view
5. Open controller at `http://192.168.0.246:8788`, enter code, click Pair
6. **Expected:** code disappears from phone, status changes to "AUTHENTICATED" or "PAIRED"
7. **Status:** NOT VERIFIED

---

## E2. NET-002 DEVICE_ID stability (run after B1 confirmed)

Logcat filter: `adb logcat -s HRAPP | grep NET002`

### E2-A. Record initial DEVICE_ID
1. Open app, note the DEVICE_ID shown in the diagnostic panel on screen
2. Also from logcat: `NET002 DEVICE_ID=<uuid>` or `NET002 DEVICE_ID generated fresh: <uuid>`
3. **Record this UUID. Every test below must show the same UUID.**
4. **Status:** NOT VERIFIED

### E2-B. App restart
1. Force-stop: `adb shell am force-stop com.hrapp.agent`
2. Reopen app
3. Logcat: `NET002 DEVICE_ID=<uuid>` must match E2-A
4. **Status:** NOT VERIFIED

### E2-C. Phone reboot
1. `adb reboot` — wait for boot complete
2. Open app
3. Logcat: `NET002 DEVICE_ID=<uuid>` must match E2-A
4. **Status:** NOT VERIFIED

### E2-D. Wi-Fi toggle
1. Turn Wi-Fi off (Settings → Wi-Fi → off) — wait for disconnect in logcat
2. Turn Wi-Fi on — wait for reconnect
3. Logcat: `NET002 DEVICE_ID=<uuid>` must match E2-A
4. Note: `current IP` in diagnostic panel **may change** — that is expected and correct
5. **Status:** NOT VERIFIED

### E2-E. Network change (if available: Wi-Fi → mobile or hotspot switch)
1. Disconnect from Wi-Fi, use mobile data (or switch hotspot)
2. Open app — wait for reconnect
3. Logcat: `NET002 DEVICE_ID=<uuid>` must match E2-A
4. Diagnostic panel: `transport` changes, `current IP` changes — DEVICE_ID stays same
5. **Status:** NOT VERIFIED

### E2-F. APK update (adb install -r)
1. `adb install -r hrapp-remote.apk`  (v15 over existing)
2. Open app
3. Logcat: `NET002 DEVICE_ID loaded from storage: <uuid>` — must match E2-A
4. Must NOT see `NET002 DEVICE_ID generated fresh` — that would mean identity was lost
5. **Status:** NOT VERIFIED

### E2-G. Uninstall + reinstall (identity reset)
1. `adb uninstall com.hrapp.agent`
2. `adb install hrapp-remote.apk`
3. Open app
4. Logcat: `NET002 DEVICE_ID generated fresh: <new-uuid>` — MUST be a DIFFERENT UUID from E2-A
5. **Status:** NOT VERIFIED

### E2-H. Network change mid-session (pairing survival)
1. Ensure paired (AUTHENTICATED state)
2. Record DEVICE_ID and current IP from diagnostic panel
3. Toggle Wi-Fi off+on (IP may change)
4. Wait for reconnect in logcat
5. Logcat: `NET002 DEVICE_ID=<uuid>` must match recorded UUID
6. Relay must re-auth without requiring new pairing code
7. Controller must still be able to send commands (e.g. PLAY_SOUND)
8. **Status:** NOT VERIFIED

---

## F. Media streams (after TASK-01 base verified)

> Run only after B+C verified.

| Stream | Command | Expected | Status |
|--------|---------|----------|--------|
| Camera | START_CAMERA from controller | CAMERA_FRAME messages appear in relay log, video shows in controller | NOT VERIFIED |
| Mic | START_MIC | MIC_CHUNK messages, audio level in controller | NOT VERIFIED |
| Screen | START_SCREEN | MediaProjection consent dialog on phone, SCREEN_FRAME messages | NOT VERIFIED |
| Location | LOCATION_REQUEST | LOCATION_EVENT with lat/lon | NOT VERIFIED |
| Speaker | PLAY_SOUND | Audible tan_tan sound on phone | NOT VERIFIED |
| Simultaneous | camera + mic + screen | All three streams running, no crash | NOT VERIFIED |

---

## G. Logcat commands reference

```bash
# Full HRAPP logs
adb logcat -s HRAPP

# State transitions only
adb logcat -s HRAPP | grep "STATE:"

# Pairing events
adb logcat -s HRAPP | grep -E "PAIR|AUTH|code"

# Errors
adb logcat -s HRAPP | grep -E "ERROR|FAIL|Exception"

# Stream activity
adb logcat -s HRAPP | grep -E "CAMERA|MIC|SCREEN|STREAM"
```

---

## Evidence template (fill per test)

```
Test: [ID]
Date/Time: 
APK version: 12 (versionCode=12)
Device: POCO X7
Relay: 192.168.0.246:8787

Logcat snippet:
[paste relevant lines]

Screen observation:
[describe / screenshot]

Result: PASS / FAIL / BLOCKED
Notes:
```
