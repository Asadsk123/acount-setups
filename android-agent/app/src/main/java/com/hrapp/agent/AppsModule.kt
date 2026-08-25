package com.hrapp.agent

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

/**
 * Installed-app inventory + per-app policy (MASTER.md §24, §25).
 *
 * Honest capability boundary (no root, no Device Owner):
 *  - list installed launchable apps: PackageManager, always available.
 *  - uninstall: fires the SYSTEM uninstall dialog (ACTION_DELETE). A normal app
 *    cannot silently remove another app — the user confirms on the device.
 *  - block / time-limit: stored here and ENFORCED by RemoteControlService
 *    (the accessibility service) bouncing the app to Home when it's blocked or
 *    over its daily budget. That's the only non-privileged way to "stop" an app;
 *    a true force-stop needs Device Owner (MDM), noted as the upgrade path.
 *
 * ponytail: policy kept in SharedPreferences (small, per-package). No DB until
 * there's a reason — MASTER.md §33 config lives centrally, this is that.
 */
object AppsModule {
    private const val PREF = "app_policy"

    data class Policy(val blocked: Boolean, val limitSeconds: Long)

    fun listApps(context: Context): JSONObject {
        val pm = context.packageManager
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val launchable = pm.getInstalledApplications(0)
            .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
            .sortedBy { pm.getApplicationLabel(it).toString().lowercase() }
        val arr = JSONArray()
        for (info in launchable) {
            val pol = readPolicy(prefs, info.packageName)
            arr.put(JSONObject().apply {
                put("pkg", info.packageName)
                put("label", pm.getApplicationLabel(info).toString())
                put("blocked", pol.blocked)
                put("limit_seconds", pol.limitSeconds)
            })
        }
        return JSONObject().put("apps", arr)
    }

    fun setPolicy(context: Context, pkg: String, blocked: Boolean, limitSeconds: Long) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putBoolean("$pkg.blocked", blocked)
            .putLong("$pkg.limit", limitSeconds)
            .apply()
        UsageTracker.reset(pkg) // fresh budget when policy changes
    }

    fun getPolicy(context: Context, pkg: String): Policy =
        readPolicy(context.getSharedPreferences(PREF, Context.MODE_PRIVATE), pkg)

    private fun readPolicy(prefs: android.content.SharedPreferences, pkg: String) =
        Policy(prefs.getBoolean("$pkg.blocked", false), prefs.getLong("$pkg.limit", 0L))

    /** Fires the system uninstall dialog; the user confirms on the device. */
    fun requestUninstall(context: Context, pkg: String) {
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}

/**
 * Tracks per-app foreground time today so time-limit policies can be enforced.
 * ponytail: in-memory counters reset at process start / policy change / midnight
 * check by the enforcer. Good enough for a daily budget; swap for UsageStatsManager
 * if cross-restart accuracy matters.
 */
object UsageTracker {
    private val secondsToday = HashMap<String, Long>()
    private var lastPkg: String? = null
    private var lastTickMs = 0L

    /** Call on each foreground-app change; returns accumulated seconds for [pkg]. */
    @Synchronized
    fun onForeground(pkg: String): Long {
        val now = System.currentTimeMillis()
        val prev = lastPkg
        if (prev != null && lastTickMs > 0) {
            secondsToday[prev] = (secondsToday[prev] ?: 0L) + (now - lastTickMs) / 1000
        }
        lastPkg = pkg
        lastTickMs = now
        return secondsToday[pkg] ?: 0L
    }

    @Synchronized fun reset(pkg: String) { secondsToday.remove(pkg) }
}
