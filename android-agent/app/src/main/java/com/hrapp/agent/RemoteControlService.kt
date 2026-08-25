package com.hrapp.agent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject

/**
 * Remote touch + navigation, MASTER.md §20. Uses Android's AccessibilityService
 * — the ONLY sanctioned path for a third-party app to synthesize input. The
 * user must enable it by hand in Settings → Accessibility; there is no
 * programmatic grant and we do not attempt one (MASTER.md §17 non-goal:
 * no permission bypass).
 *
 * Capabilities: tap, swipe, and the global nav actions (back/home/recents/
 * notifications). Text entry via accessibility is only reliable into a focused
 * editable node; that's handled with ACTION_SET_TEXT where a focused field
 * exists, else reported as not-applied rather than silently dropped.
 *
 * ponytail: static `instance` handoff instead of a bound service / event bus.
 * One accessibility service, one Agent — a bus would be ceremony. Revisit if a
 * second consumer of the service appears.
 */
class RemoteControlService : AccessibilityService() {

    override fun onServiceConnected() {
        instance = this
        Agent.log("accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* command-driven, not event-driven */ }
    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
    }

    // Controller sends normalized coords (0..1) because it can't know the
    // phone's resolution; scale to real pixels here.
    private fun sx(nx: Double) = (nx.coerceIn(0.0, 1.0) * resources.displayMetrics.widthPixels).toFloat()
    private fun sy(ny: Double) = (ny.coerceIn(0.0, 1.0) * resources.displayMetrics.heightPixels).toFloat()

    private fun doTap(x: Float, y: Float): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 50)
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun doSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceIn(20, 5000))
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun doGlobal(action: String): Boolean {
        val id = when (action) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "lock_screen" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) GLOBAL_ACTION_LOCK_SCREEN else return false
            else -> return false
        }
        return performGlobalAction(id)
    }

    private fun doText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityEvent.TYPE_VIEW_FOCUSED) ?: return false
        val args = android.os.Bundle().apply {
            putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focused.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    companion object {
        @Volatile private var instance: RemoteControlService? = null

        /** True only when the user has enabled our service in Accessibility settings. */
        fun isEnabled(context: Context): Boolean {
            val expected = "${context.packageName}/${RemoteControlService::class.java.name}"
            val enabled = Settings.Secure.getString(
                context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false
            return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
        }

        /**
         * Route one INPUT_COMMAND payload to the running service. Returns false
         * (not an exception) when the service isn't enabled or the action is
         * unsupported — the caller reports that back so the controller never
         * shows a success it didn't get (MASTER.md §9 "never claim delivered").
         */
        fun dispatch(payload: JSONObject): Boolean {
            val svc = instance ?: return false
            return when (payload.optString("action")) {
                "tap" -> svc.doTap(svc.sx(payload.getDouble("nx")), svc.sy(payload.getDouble("ny")))
                "swipe" -> svc.doSwipe(
                    svc.sx(payload.getDouble("nx1")), svc.sy(payload.getDouble("ny1")),
                    svc.sx(payload.getDouble("nx2")), svc.sy(payload.getDouble("ny2")),
                    payload.optLong("duration_ms", 300)
                )
                "global" -> svc.doGlobal(payload.optString("name"))
                "text" -> svc.doText(payload.optString("text"))
                else -> false
            }
        }
    }
}
