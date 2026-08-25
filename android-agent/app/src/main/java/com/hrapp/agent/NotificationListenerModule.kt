package com.hrapp.agent

import android.content.Context
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Notification mirroring (MASTER.md §23). Uses Android's NotificationListenerService,
 * the only sanctioned way to read posted notifications. The user must grant
 * "Notification access" by hand in system settings — there is no programmatic
 * grant and we do not attempt one (MASTER.md §17 non-goal: no permission bypass).
 *
 * Forwards a normalized {app, title, text} to the controller. Does NOT persist
 * notification content (MASTER.md §13/§23 retention: minimize).
 */
class NotificationListenerModule : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val appLabel = appLabel(sbn.packageName)
        // Skip our own foreground-service notifications to avoid a feedback loop.
        if (sbn.packageName == packageName) return
        Agent.sendNotification(appLabel, title, text)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) { /* not mirrored in v1 */ }

    private fun appLabel(pkg: String): String = try {
        val pm = packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) { pkg }

    companion object {
        /** True only when the user has granted Notification access to this app. */
        fun isEnabled(context: Context): Boolean {
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
            return flat.split(':').any { it.contains(context.packageName) }
        }
    }
}
