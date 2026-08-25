package com.hrapp.agent

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Looper
import androidx.core.app.ActivityCompat

/**
 * MASTER.md §21. ponytail: plain android.location.LocationManager, not
 * FusedLocationProvider — avoids the Google Play Services dependency
 * (extra jar to resolve) for one-shot location requests. Switch to fused
 * if/when battery-adaptive polling (§21) is actually implemented.
 */
object LocationModule {
    fun isAvailable(context: Context): Boolean {
        val granted = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return granted && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
    }

    fun requestOnce(context: Context) {
        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            Agent.log("LOCATION_REQUEST denied: permission not granted")
            return
        }
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (provider == null) {
            Agent.log("LOCATION_REQUEST failed: no provider enabled")
            return
        }
        lm.requestSingleUpdate(provider, { location ->
            Agent.reportLocation(location.latitude, location.longitude, location.accuracy)
        }, Looper.getMainLooper())
    }
}
