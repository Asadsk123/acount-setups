package com.hrapp.agent

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Thin UI over the Agent singleton (which owns the relay connection and module
 * router — Agent.kt). This Activity only renders status/pairing code/log and
 * offers the buttons that walk the user through the one-time, hand-granted
 * permissions each sensitive module needs (Accessibility, Device Admin,
 * Location). It never grants anything itself — MASTER.md §18.
 */
class MainActivity : AppCompatActivity(), Agent.StatusListener {

    private lateinit var statusText: TextView
    private lateinit var pairingCodeText: TextView
    private lateinit var logText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusText = findViewById(R.id.statusText)
        pairingCodeText = findViewById(R.id.pairingCodeText)
        logText = findViewById(R.id.logText)

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
        findViewById<Button>(R.id.btnLocation).setOnClickListener {
            requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION), 1001)
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
