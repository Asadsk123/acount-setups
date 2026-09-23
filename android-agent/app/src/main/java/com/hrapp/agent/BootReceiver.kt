package com.hrapp.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Restarts the agent connection after device reboot or app update so the
 * trusted pairing survives without requiring the user to reopen the app.
 *
 * IMPORTANT: this only starts ConnectionService (keeps the process alive +
 * reconnects to the relay). It does NOT auto-start camera/mic/screen — those
 * require explicit controller commands and, in some cases, new OS consent
 * (MediaProjection is always per-session on Android 14+).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        // startForegroundService is required on API 26+ for foreground services.
        val svc = Intent(context, ConnectionService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc)
        } else {
            context.startService(svc)
        }
    }
}
