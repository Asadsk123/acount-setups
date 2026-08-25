plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hrapp.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hrapp.agent"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-vertical-slice"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Zero third-party dependencies: plain framework Activity, org.json is in
    // android.jar, and WebSocket is our own MiniWebSocket. This keeps the app
    // buildable both via Gradle AND via the dependency-free manual pipeline
    // (build_full.sh) used when Gradle's daemon socket is unavailable.
}
