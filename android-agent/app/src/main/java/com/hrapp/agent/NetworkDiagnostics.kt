package com.hrapp.agent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import java.net.NetworkInterface

/**
 * Read-only network diagnostics for the diagnostic screen (NET-002 requirement).
 *
 * Key design note: DEVICE_ID is derived from app-private SharedPreferences
 * (a UUID generated once, never from the network IP). The current IP is shown
 * here labelled "dynamic" to make the stable-vs-transient distinction explicit.
 *
 * Do NOT use currentLocalIp() as a device identifier.
 */
object NetworkDiagnostics {

    data class Snapshot(
        val deviceId: String,       // stable — changes only on fresh install / data clear
        val transport: String,      // dynamic — Wi-Fi / mobile / other / unknown
        val currentIp: String,      // dynamic — changes with DHCP / network switch
        val relayEndpoint: String,  // user-configured relay address
        val connectionState: String // current ConnectionState name
    )

    fun snapshot(ctx: Context): Snapshot {
        val deviceId = Agent.deviceId ?: "(not yet assigned)"
        val (transport, ip) = networkInfo(ctx)
        return Snapshot(
            deviceId = deviceId,
            transport = transport,
            currentIp = ip,
            relayEndpoint = Agent.getRelayHost(),
            connectionState = Agent.state.name
        )
    }

    /** Format for on-screen display. Deliberately labels dynamic fields. */
    fun format(s: Snapshot): String = buildString {
        appendLine("── DEVICE IDENTITY (stable) ──────────────────")
        appendLine("DEVICE_ID : ${s.deviceId}")
        appendLine("  (never changes with network; resets only on")
        appendLine("   uninstall/data-clear — NOT the Wi-Fi IP)")
        appendLine()
        appendLine("── NETWORK (dynamic — changes with IP/network) ──")
        appendLine("transport  : ${s.transport}")
        appendLine("current IP : ${s.currentIp}  ← dynamic, DO NOT use as identity")
        appendLine("relay      : ${s.relayEndpoint}")
        appendLine()
        appendLine("── CONNECTION ────────────────────────────────")
        appendLine("state      : ${s.connectionState}")
    }

    private fun networkInfo(ctx: Context): Pair<String, String> {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork
        val caps = if (net != null) cm.getNetworkCapabilities(net) else null
        val transport = when {
            caps == null -> "none"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
        val ip = localIp()
        return transport to ip
    }

    /** Best-effort local IP. Returns first non-loopback IPv4 address. */
    private fun localIp(): String {
        return try {
            NetworkInterface.getNetworkInterfaces()?.asSequence()
                ?.filter { !it.isLoopback && it.isUp }
                ?.flatMap { it.inetAddresses.asSequence() }
                ?.firstOrNull { !it.isLoopbackAddress && it.hostAddress?.contains(':') == false }
                ?.hostAddress ?: "unavailable"
        } catch (_: Exception) { "unavailable" }
    }
}
