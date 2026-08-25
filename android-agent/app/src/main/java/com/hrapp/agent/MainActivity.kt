package com.hrapp.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusText = findViewById(R.id.statusText)
        pairingCodeText = findViewById(R.id.pairingCodeText)
        logText = findViewById(R.id.logText)
        relayHost = findViewById(R.id.relayHost)
        relayHost.setText(Agent.getRelayHost())

        // Step 1: ask for the runtime permissions right away.
        requestPermissions(arrayOf(
            android.Manifest.permission.RECORD_AUDIO,
            android.Manifest.permission.CAMERA,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ), 1000)

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
        Agent.setStatusListener(this)
    }

    override fun onPause() {
        super.onPause()
        Agent.setStatusListener(null)
    }

    override fun onStatus(text: String) = runOnUiThread { statusText.text = text }
    override fun onPairingCode(code: String) = runOnUiThread { pairingCodeText.text = code }
    override fun onLog(line: String) = runOnUiThread {
        logText.text = "$line\n${logText.text}".take(2000)
    }
}
