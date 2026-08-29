#!/bin/bash
# Phone-less verification of the agent's REAL networking code.
# Compiles the app's actual MiniWebSocket.kt + a small harness, runs it on the
# JVM against a running relay (ws://localhost:8787), pairs, authenticates, and
# handles a PLAY_SOUND command — proving the pairing/command path the app uses,
# with no Android device. (Android-hardware APIs stay NOT VERIFIED off-device.)
set -e
JAVA_HOME="C:/Android/jdk21/jdk-21.0.5+11"
KOTLINC="C:/Android/kotlinc-dl/kotlinc/bin/kotlinc.bat"
STDLIB="C:/Android/kotlinc-dl/kotlinc/lib/kotlin-stdlib.jar"
HERE="$(cd "$(dirname "$0")" && pwd)"
MWS="$HERE/../app/src/main/java/com/hrapp/agent/MiniWebSocket.kt"
OUT="$HERE/out"
winpath() { echo "$1" | sed 's|^/\([a-zA-Z]\)/|\1:/|'; }

rm -rf "$OUT"; mkdir -p "$OUT"
ARGF="$HERE/args.txt"
{ echo "-nowarn"; echo "-d \"$(winpath "$OUT")\""; echo "\"$(winpath "$MWS")\""; echo "\"$(winpath "$HERE/JvmAgentHarness.kt")\""; } > "$ARGF"
"$KOTLINC" "@$(winpath "$ARGF")"

LOG=/tmp/hrapp_harness.log
"$JAVA_HOME/bin/java.exe" -cp "$(winpath "$OUT");$STDLIB" com.hrapp.agent.Harness > "$LOG" 2>&1 &
for i in $(seq 1 15); do grep -q "HARNESS_READY" "$LOG" 2>/dev/null && break; sleep 1; done
CODE=$(grep -oE "code=[0-9]+" "$LOG" | head -1 | cut -d= -f2)
DEV=$(grep -oE "device=[a-zA-Z0-9-]+" "$LOG" | head -1 | cut -d= -f2)
echo "paired: code=$CODE device=$DEV"
# controller driver must run where the 'ws' package resolves (relay-server)
cp "$HERE/controller_driver.js" "$HERE/../../relay-server/_hdriver.js"
( cd "$HERE/../../relay-server" && node _hdriver.js "$CODE" "$DEV"; rm -f _hdriver.js )
sleep 2
grep -E "RESULT:" "$LOG"
grep -q "RESULT: PASS" "$LOG"
