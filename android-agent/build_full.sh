#!/bin/bash
# Full-app manual build — Gradle-free. Compiles the complete Kotlin agent
# (all modules) into an installable APK using kotlinc + aapt2 + d8 + apksigner,
# none of which need Gradle's daemon IPC socket (blocked in this sandbox).
# The app is dependency-free (no AndroidX, no OkHttp) so no AAR/resource merge
# is needed — plain framework only.
set -e

SDK="C:/Android"
BT="$SDK/build-tools/35.0.0"
PLATFORM_JAR="$SDK/platforms/android-34/android.jar"
JAVA_HOME_M="C:/Android/jdk21/jdk-21.0.5+11"
KOTLINC="$SDK/kotlinc-dl/kotlinc/bin/kotlinc.bat"
KOTLIN_STDLIB="$SDK/kotlinc-dl/kotlinc/lib/kotlin-stdlib.jar"

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/app/src/main"
OUT="$HERE/build-manual"

export JAVA_HOME="$JAVA_HOME_M"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/apk"

echo "== 1/6 compile resources =="
"$BT/aapt2.exe" compile --dir "$APP/res" -o "$OUT/res.zip"

echo "== 2/6 link resources + manifest (generate R.java) =="
"$BT/aapt2.exe" link \
  -o "$OUT/apk/base.apk" \
  --manifest "$APP/AndroidManifest.xml" \
  -I "$PLATFORM_JAR" \
  -R "$OUT/res.zip" \
  --java "$OUT/gen" \
  --min-sdk-version 26 --target-sdk-version 34 --auto-add-overlay

echo "== 3/6 javac R.java =="
"$JAVA_HOME/bin/javac.exe" --release 17 -d "$OUT/classes" -classpath "$PLATFORM_JAR" \
  $(find "$OUT/gen" -name "R.java")

echo "== 4/6 kotlinc (all modules) =="
# kotlinc.bat needs Windows-style paths, and cmd.exe splits a ';' classpath on
# the command line into separate args — so pass everything via an @argfile,
# where the semicolon is read from the file and stays intact.
winpath() { echo "$1" | sed 's|^/\([a-zA-Z]\)/|\1:/|'; }
OUT_W=$(winpath "$OUT")
ARGFILE="$OUT/kotlinc.args"
{
  echo "-nowarn"
  echo "-classpath \"$PLATFORM_JAR;$OUT_W/classes\""
  echo "-d \"$OUT_W/kotlin_classes\""
  for f in $(find "$APP/java" -name "*.kt"); do echo "\"$(winpath "$f")\""; done
} > "$ARGFILE"
"$KOTLINC" "@$(winpath "$ARGFILE")"

echo "== 5/6 d8 (dex: app + R + kotlin-stdlib) =="
"$BT/d8.bat" --min-api 26 --lib "$PLATFORM_JAR" --output "$OUT/apk" \
  "$KOTLIN_STDLIB" \
  $(find "$OUT/classes" -name "*.class") \
  $(find "$OUT/kotlin_classes" -name "*.class")

echo "== 6/6 package + sign =="
cd "$OUT/apk"
cp base.apk app_unsigned.apk
"$JAVA_HOME/bin/jar.exe" uf app_unsigned.apk classes.dex
cd "$HERE"
KS="$OUT/debug.keystore"
if [ ! -f "$KS" ]; then
  "$JAVA_HOME/bin/keytool.exe" -genkeypair -v -keystore "$KS" -storepass android -keypass android \
    -alias hrapp -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=HRAPP,O=HRAPP,C=US"
fi
"$BT/apksigner.bat" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/apk/hrapp-agent.apk" "$OUT/apk/app_unsigned.apk"
"$BT/apksigner.bat" verify "$OUT/apk/hrapp-agent.apk" && echo "SIGNATURE OK"

echo
echo "BUILD OK -> $OUT/apk/hrapp-agent.apk"
