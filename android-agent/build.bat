@echo off
REM Standard Gradle build. If Gradle can't run in your environment (daemon
REM socket blocked), use build_full.sh instead (Git Bash) — it produces the
REM same APK without Gradle. The app is dependency-free so both paths work.
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
echo Gradle build failed. Try the Gradle-free path in Git Bash:
echo   bash build_full.sh
echo (produces build-manual\apk\hrapp-agent.apk)

:end
pause
