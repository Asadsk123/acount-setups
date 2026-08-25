package com.hrapp.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Keeps the agent's relay connection alive when the app is not in the
 * foreground. Without this, Android suspends the process the moment the user
 * leaves the app (e.g. to type the pairing code on the PC) or the screen locks —
 * which is why commands stopped reaching the phone after pairing.
 *
 * Runs as a foreground service with a persistent, visible notification. The
 * notification is required by the platform AND by MASTER.md §50 (monitoring must
 * be visible to the device user, never hidden).
 */
class ConnectionService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "hrapp_connection"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(channelId, "HRAPP connection", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val n: Notification = Notification.Builder(this, channelId)
            .setContentTitle("HRAPP Agent running")
            .setContentText("Connected to controller")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(42, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(42, n)
        }
        // Agent is already connected via HrappApplication; this service just keeps
        // the process alive so that connection isn't suspended.
        return START_STICKY
    }

    companion object {
        fun start(context: Context) {
            val intent = Intent(context, ConnectionService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
            else context.startService(intent)
        }
    }
}
