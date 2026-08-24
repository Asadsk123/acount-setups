package com.hrapp.agent

import android.media.MediaPlayer
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Vertical-slice agent: pairing + PLAY_SOUND only (docs/PROTOCOL.md, ADR-0004).
 * Everything else in MASTER.md (screen, input, location, ...) is a separate
 * module added later — this activity intentionally does not grow to hold them.
 *
 * ponytail: relay connection lives directly in the Activity for this slice.
 * Move to a bound Service once the agent needs to survive Activity death
 * (Phase 1 hardening) — MASTER.md §16 connection-manager requirement.
 */
class MainActivity : AppCompatActivity() {

    // 10.0.2.2 is the emulator's alias for the host machine's localhost.
    // For a real device on the same LAN, replace with the dev machine's LAN IP.
    private val relayUrl = "ws://10.0.2.2:8787"

    private lateinit var statusText: TextView
    private lateinit var pairingCodeText: TextView
    private lateinit var logText: TextView

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private var ws: WebSocket? = null
    private var deviceId: String? = null
    private var mediaPlayer: MediaPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        statusText = findViewById(R.id.statusText)
        pairingCodeText = findViewById(R.id.pairingCodeText)
        logText = findViewById(R.id.logText)
        connect()
    }

    private fun connect() {
        setStatus("connecting to relay…")
        val request = Request.Builder().url(relayUrl).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                appendLog("relay connected")
                sendPairInit()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                setStatus("relay unreachable: ${t.message}")
                appendLog("connection failed — retrying in 5s")
                webSocket.close(1000, null)
                android.os.Handler(mainLooper).postDelayed({ connect() }, 5000)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                setStatus("disconnected")
            }
        })
    }

    private fun send(json: JSONObject) {
        json.put("protocol_version", 1)
        json.put("timestamp", System.currentTimeMillis())
        ws?.send(json.toString())
    }

    private fun sendPairInit() {
        send(JSONObject().apply {
            put("message_type", "PAIR_INIT")
            put("request_id", UUID.randomUUID().toString())
        })
    }

    private fun handleMessage(text: String) {
        val msg = JSONObject(text)
        when (msg.optString("message_type")) {
            "PAIR_INIT_RESPONSE" -> {
                val payload = msg.getJSONObject("payload")
                deviceId = payload.getString("device_id")
                val code = payload.getString("pairing_code")
                runOnUiThread { pairingCodeText.text = code }
                appendLog("pairing code issued: $code")
                sendAuth()
            }
            "AUTH_RESPONSE" -> {
                if (msg.optString("status") == "OK") {
                    setStatus("paired — waiting for commands")
                } else {
                    setStatus("auth failed")
                }
            }
            "PLAY_SOUND" -> {
                val soundId = msg.getJSONObject("payload").optString("sound_id", "tan_tan")
                appendLog("PLAY_SOUND received: $soundId")
                playSound()
                sendPlaySoundResult()
            }
        }
    }

    private fun sendAuth() {
        send(JSONObject().apply {
            put("message_type", "AUTH_REQUEST")
            put("device_id", deviceId)
            put("role", "agent")
        })
    }

    private fun sendPlaySoundResult() {
        send(JSONObject().apply {
            put("message_type", "PLAY_SOUND_RESULT")
            put("device_id", deviceId)
            put("payload", JSONObject().put("result", "PLAYED"))
        })
        appendLog("PLAY_SOUND_RESULT sent")
    }

    private fun playSound() {
        mediaPlayer?.release()
        mediaPlayer = MediaPlayer.create(this, R.raw.tan_tan)
        mediaPlayer?.setOnCompletionListener { it.release() }
        mediaPlayer?.start()
    }

    private fun setStatus(text: String) = runOnUiThread { statusText.text = text }

    private fun appendLog(line: String) = runOnUiThread {
        logText.text = "$line\n${logText.text}".take(2000)
    }

    override fun onDestroy() {
        super.onDestroy()
        ws?.close(1000, "activity destroyed")
        mediaPlayer?.release()
    }
}
