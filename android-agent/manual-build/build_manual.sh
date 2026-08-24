#!/bin/bash
# Manual Android build pipeline — bypasses Gradle entirely (its daemon IPC
# socket is blocked in this sandboxed session; see docs/PROJECT_PROGRESS.md).
# Uses only native/JVM tools that don't need Gradle's Selector-based IPC:
# aapt2 (native), javac (JDK, no networking), d8 (standalone JVM compiler,
# no daemon), apksigner (standalone JVM tool, no daemon).
set -e

SDK="C:/Android"
BT="$SDK/build-tools/35.0.0"
PLATFORM_JAR="$SDK/platforms/android-34/android.jar"
JAVA_HOME_MANUAL="C:/Android/jdk21/jdk-21.0.5+11"
RES_DIR="../app/src/main/res"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"

export JAVA_HOME="$JAVA_HOME_MANUAL"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/apk"

echo "== 1/6 compiling resources =="
"$BT/aapt2.exe" compile --dir "$RES_DIR" -o "$OUT/compiled_res.zip"

echo "== 2/6 linking resources + manifest, generating R.java =="
"$BT/aapt2.exe" link \
  -o "$OUT/apk/base_unsigned.apk" \
  --manifest "$HERE/AndroidManifest.xml" \
  -I "$PLATFORM_JAR" \
  -R "$OUT/compiled_res.zip" \
  --auto-add-overlay \
  --java "$OUT/gen" \
  --min-sdk-version 26 --target-sdk-version 34

echo "== 3/6 javac =="
"$JAVA_HOME/bin/javac.exe" --release 17 -encoding UTF-8 \
  -classpath "$PLATFORM_JAR" \
  -d "$OUT/classes" \
  "$HERE/src/com/hrapp/agent/"*.java \
  "$OUT/gen/com/hrapp/agent/R.java"

echo "== 4/6 d8 (dex) =="
"$BT/d8.bat" --output "$OUT/apk" --min-api 26 --lib "$PLATFORM_JAR" \
  $(find "$OUT/classes" -name "*.class")

echo "== 5/6 assembling APK (resources + dex) =="
cd "$OUT/apk"
cp base_unsigned.apk app_unsigned.apk
"$BT/aapt2.exe" 2>/dev/null || true
# aapt2 has no "add file" subcommand; use the jar tool (from JDK) to add classes.dex into the zip.
"$JAVA_HOME/bin/jar.exe" uf app_unsigned.apk classes.dex
cd "$HERE"

echo "== 6/6 signing (debug key) =="
KEYSTORE="$OUT/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  "$JAVA_HOME/bin/keytool.exe" -genkeypair -v -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner.bat" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/apk/app-debug.apk" "$OUT/apk/app_unsigned.apk"

echo "== verify =="
"$BT/apksigner.bat" verify "$OUT/apk/app-debug.apk" && echo "SIGNATURE OK"
"$BT/aapt2.exe" dump badging "$OUT/apk/app-debug.apk" | head -5

echo
echo "BUILD OK -> $OUT/apk/app-debug.apk"
