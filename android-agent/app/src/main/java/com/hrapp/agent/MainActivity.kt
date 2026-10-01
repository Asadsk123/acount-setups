package com.hrapp.agent

import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

/**
 * Onboarding + status UI over the Agent singleton.
 *
 * Flow the operator asked for (permissions -> code -> pair):
 *  1. On first launch, auto-request the runtime permissions (mic/camera/location).
 *  2. Enter the controller PC's IP so the agent can reach the relay — without a
 *     reachable relay there is no pairing code, which is why pairing looked dead.
 *  3. The pairing code shows big; enter it in the controller.
 *  4. Buttons walk through the special accesses (notification / accessibility /
 *     device-admin) each granted by hand in system settings.
 *
 * The app deliberately stays VISIBLE — no hidden/stealth mode. Concealing the app
 * from the device user is exactly what MASTER.md §50 forbids (no hidden monitoring).
 */
class MainActivity : Activity(), Agent.StatusListener {

    private lateinit var statusText: TextView
    private lateinit var pairingCodeText: TextView
    private lateinit var logText: TextView
    private lateinit var relayHost: EditText
    private lateinit var diagText: TextView
    private var versionTapCount = 0
    private val diagHandler = Handler(Looper.getMainLooper())
    private val diagRunnable = object : Runnable {
        override fun run() { refreshDiag(); diagHandler.postDelayed(this, 5_000) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusText = findViewById(R.id.statusText)
        pairingCodeText = findViewById(R.id.pairingCodeText)
        logText = findViewById(R.id.logText)
        diagText = findViewById(R.id.diagText)
        relayHost = findViewById(R.id.relayHost)
        relayHost.setText(Agent.getRelayHost().let {
            // Show blank if using the built-in production URL (keeps field clean for dev use)
            if (it == Agent.getProductionRelayUrl()) "" else it
        })

        // 5-tap on version text reveals the developer relay override field
        findViewById<TextView>(R.id.versionTap).setOnClickListener {
            versionTapCount++
            if (versionTapCount >= 5) {
                versionTapCount = 0
                val row = findViewById<android.view.View>(R.id.devRelayRow)
                row.visibility = if (row.visibility == android.view.View.GONE)
                    android.view.View.VISIBLE else android.view.View.GONE
            }
        }

        // SETUP-001: show T&C on first run; block until accepted.
        if (SetupManager.needsTerms(this)) {
            showTermsDialog()
            return
        }

        startMainFlow()
    }

    private fun showTermsDialog() {
        AlertDialog.Builder(this)
            .setTitle("Terms & Conditions")
            .setMessage(
                "HRAPP Remote Monitor\n\n" +
                "By continuing you confirm:\n" +
                "• You own or have explicit written permission to monitor this device.\n" +
                "• The device user has been informed this app is installed.\n" +
                "• You will not use this app for covert surveillance.\n\n" +
                "Misuse is illegal and prohibited."
            )
            .setCancelable(false)
            .setPositiveButton("I Agree") { _, _ ->
                SetupManager.acceptTerms(this)
                startMainFlow()
            }
            .setNegativeButton("Decline") { _, _ -> finish() }
            .show()
    }

    private fun startMainFlow() {
        // Keep the relay connection alive in the background (foreground service).
        ConnectionService.start(this)

        // Step 1: ask for the runtime permissions right away.
        val perms = mutableListOf(
            android.Manifest.permission.RECORD_AUDIO,
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        )
        if (android.os.Build.VERSION.SDK_INT >= 33) perms.add("android.permission.POST_NOTIFICATIONS")
        requestPermissions(perms.toTypedArray(), 1000)

        // Dev relay override: apply new URL and reconnect.
        findViewById<Button>(R.id.btnConnect).setOnClickListener {
            Agent.setRelayHost(relayHost.text.toString())
        }
        findViewById<Button>(R.id.btnMedia).setOnClickListener {
            requestPermissions(arrayOf(
                android.Manifest.permission.RECORD_AUDIO,
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.ACCESS_FINE_LOCATION
            ), 1002)
        }
        findViewById<Button>(R.id.btnNotifications).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        findViewById<Button>(R.id.btnAccessibility).setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        findViewById<Button>(R.id.btnDeviceAdmin).setOnClickListener {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                    ComponentName(this@MainActivity, LockAdminReceiver::class.java))
                putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Allows the paired controller to lock this device.")
            }
            startActivity(intent)
        }

    }

    override fun onResume() {
        super.onResume()
        Log.d("HRAPP", "MainActivity.onResume — registering StatusListener")
        Agent.setStatusListener(this)
        diagHandler.post(diagRunnable) // start periodic diagnostic refresh
    }

    override fun onPause() {
        super.onPause()
        Log.d("HRAPP", "MainActivity.onPause — clearing StatusListener")
        Agent.setStatusListener(null)
        diagHandler.removeCallbacks(diagRunnable)
    }

    private fun refreshDiag() {
        // NetworkInterface.getNetworkInterfaces() must NOT run on the main thread.
        Thread {
            val snap = NetworkDiagnostics.snapshot(this)
            val text = NetworkDiagnostics.format(snap)
            Log.d("HRAPP", "DIAG device_id=${snap.deviceId} transport=${snap.transport} ip=${snap.currentIp} relay=${snap.relayEndpoint} state=${snap.connectionState}")
            runOnUiThread { if (!isFinishing) diagText.text = text }
        }.start()
    }

    override fun onStatus(text: String) = runOnUiThread {
        Log.d("HRAPP", "onStatus: $text")
        statusText.text = text
    }
    override fun onPairingCode(code: String) = runOnUiThread {
        Log.d("HRAPP", "onPairingCode: '$code' (len=${code.length})")
        pairingCodeText.text = code
    }
    override fun onLog(line: String) = runOnUiThread {
        Log.d("HRAPP", "onLog: $line")
        logText.text = "$line\n${logText.text}".take(2000)
    }
    override fun onStateChange(state: ConnectionState) = runOnUiThread {
        Log.d("HRAPP", "onStateChange: $state")
        title = "HRAPP [${state.name}]"
        refreshDiag() // update diag panel immediately on state change
    }
}
