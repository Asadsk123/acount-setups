@echo off
REM Run this yourself in a normal cmd/PowerShell window (double-click it, or
REM open cmd.exe and run it) — NOT through the Claude Code tool. JDK/SDK/Gradle
REM are already downloaded to C:\Android by the assistant; this just wires
REM them up and builds the APK.
set JAVA_HOME=C:\Android\jdk21\jdk-21.0.5+11
set ANDROID_HOME=C:\Android
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;C:\Android\gradle\gradle-8.9\bin;%PATH%

cd /d "%~dp0"
echo Generating Gradle wrapper...
call gradle wrapper --gradle-version 8.9
if errorlevel 1 goto :error

echo Building debug APK...
call gradlew.bat assembleDebug
if errorlevel 1 goto :error

echo.
echo BUILD OK. APK at: app\build\outputs\apk\debug\app-debug.apk
echo Install on a connected/USB-debugging phone with:
echo   adb install -r app\build\outputs\apk\debug\app-debug.apk
goto :end

:error
echo.
echo BUILD FAILED — see output above.

:end
pause
