package com.hrapp.agent

import android.content.Context
import android.content.Intent

/**
 * Screen mirroring via MediaProjection (MASTER.md §19). Android 14+ requires
 * fresh user consent for every capture session, so start() launches the system
 * consent dialog (MediaProjectionActivity) rather than assuming a stored token —
 * MASTER.md §19 explicitly forbids designing around permanent authorization.
 *
 * The actual capture + JPEG encode runs in ScreenCaptureService (a
 * mediaProjection foreground service, as the platform now mandates).
 */
object ScreenCaptureModule {
    fun start(context: Context) {
        val intent = Intent(context, MediaProjectionActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun stop(context: Context) {
        context.stopService(Intent(context, ScreenCaptureService::class.java))
        Agent.sendStreamStatus("screen", "stopped")
    }
}
