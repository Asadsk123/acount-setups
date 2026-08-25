package com.hrapp.agent

import android.content.Context
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import org.json.JSONObject

/** MASTER.md §26 — no OS permission required, pure device APIs. */
object DeviceInfoModule {
    fun snapshot(context: Context): JSONObject {
        val batteryStatus = context.registerReceiver(null, IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val status = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }
        val networkType = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            else -> "other"
        }

        val stat = StatFs(Environment.getDataDirectory().path)
        val totalBytes = stat.blockCountLong * stat.blockSizeLong
        val freeBytes = stat.availableBlocksLong * stat.blockSizeLong

        return JSONObject().apply {
            put("model", Build.MODEL)
            put("manufacturer", Build.MANUFACTURER)
            put("android_version", Build.VERSION.RELEASE)
            put("sdk_int", Build.VERSION.SDK_INT)
            put("battery_pct", pct)
            put("charging", charging)
            put("network_type", networkType)
            put("storage_total_bytes", totalBytes)
            put("storage_free_bytes", freeBytes)
        }
    }
}
