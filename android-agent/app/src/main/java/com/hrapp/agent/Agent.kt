package com.hrapp.agent

import android.app.Application
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.UUID

/**
 * Singleton connection + message router, shared by MainActivity and the
 * modules that don't have their own Activity (RemoteControlService,
 * LockAdminReceiver). Lives for the process lifetime via HrappApplication,
 * so remote control keeps working even when MainActivity isn't foregrounded.
 *
 * ponytail: a `when` dispatch instead of a registry/plugin system — five
 * modules is small enough that a registry would be the premature abstraction,
 * not the simplification. Revisit if module count grows past ~10.
 */
object Agent {
    // Relay address is user-configurable (phone + PC must reach each other).
    // Stored in prefs so it survives restarts; defaults to a LAN placeholder
    // the user edits on first launch. This is why pairing "does nothing" if the
    // IP is wrong — the agent can't reach the relay to get a code.
    private const val PREF = "agent_config"
    private const val DEFAULT_HOST = "192.168.1.100"
    private const val PORT = 8787

    interface StatusListener {
        fun onStatus(text: String)
        fun onPairingCode(code: String)
        fun onLog(line: String)
    }

    private var ws: MiniWebSocket? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    var deviceId: String? = null
        private set
    private var statusListener: StatusListener? = null
    private lateinit var appContext: Application

    fun init(app: Application) {
        if (::appContext.isInitialized) return
        appContext = app
        connect()
    }

    fun setStatusListener(listener: StatusListener?) {
        statusListener = listener
    }

    fun getRelayHost(): String =
        appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE).getString("relay_host", DEFAULT_HOST) ?: DEFAULT_HOST

    /** Called from the UI when the user enters/changes the PC's IP. Reconnects. */
    fun setRelayHost(host: String) {
        appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE).edit().putString("relay_host", host.trim()).apply()
        ws?.close()
        deviceId = null
        connect()
    }

    private fun connect() {
        status("connecting to ${getRelayHost()}…")
        ws = MiniWebSocket(getRelayHost(), PORT, "/", object : MiniWebSocket.Listener {
            override fun onOpen() {
                log("relay connected")
                sendPairInit()
            }
            override fun onMessage(text: String) {
                mainHandler.post { handleMessage(text) }
            }
            override fun onFailure(t: Throwable) {
                status("relay unreachable: ${t.message}")
                log("connection failed — retrying in 5s")
                mainHandler.postDelayed({ connect() }, 5000)
            }
            override fun onClosed() {
                status("disconnected")
            }
        }).also { it.connectAsync() }
    }

    fun send(json: JSONObject) {
        json.put("protocol_version", 1)
        json.put("timestamp", System.currentTimeMillis())
        ws?.send(json.toString())
    }

    fun send(type: String, payload: JSONObject? = null, requestId: String = UUID.randomUUID().toString()) {
        send(JSONObject().apply {
            put("message_type", type)
            put("request_id", requestId)
            deviceId?.let { put("device_id", it) }
            if (payload != null) put("payload", payload)
        })
    }

    /** Stable identity so reconnects keep the SAME device_id — otherwise every
     *  reconnect would orphan the controller's pairing. Generated once, persisted. */
    private fun stableDeviceId(): String {
        val prefs = appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
        var id = prefs.getString("device_id", null)
        if (id == null) {
            id = UUID.randomUUID().toString()
            prefs.edit().putString("device_id", id).apply()
        }
        return id
    }

    private fun sendPairInit() {
        deviceId = stableDeviceId()
        send(JSONObject().apply {
            put("message_type", "PAIR_INIT")
            put("request_id", UUID.randomUUID().toString())
            put("device_id", deviceId) // relay reuses this id, so pairing survives reconnects
        })
    }

    private fun sendAuth() {
        send(JSONObject().apply {
            put("message_type", "AUTH_REQUEST")
            put("device_id", deviceId)
            put("role", "agent")
        })
    }

    private fun handleMessage(text: String) {
        val msg = JSONObject(text)
        when (val type = msg.optString("message_type")) {
            "PAIR_INIT_RESPONSE" -> {
                val payload = msg.getJSONObject("payload")
                deviceId = payload.getString("device_id")
                val code = payload.getString("pairing_code")
                mainHandler.post { statusListener?.onPairingCode(code) }
                log("pairing code issued: $code")
                sendAuth()
            }
            "AUTH_RESPONSE" -> {
                if (msg.optString("status") == "OK") {
                    status("paired — waiting for commands")
                    sendCapabilities()
                } else {
                    status("auth failed")
                }
            }
            "PLAY_SOUND" -> {
                val soundId = msg.getJSONObject("payload").optString("sound_id", "tan_tan")
                log("PLAY_SOUND received: $soundId")
                SoundModule.play(appContext, soundId)
                send("PLAY_SOUND_RESULT", JSONObject().put("result", "PLAYED"))
            }
            "DEVICE_INFO_REQUEST" -> {
                log("DEVICE_INFO_REQUEST received")
                send("DEVICE_INFO_RESPONSE", DeviceInfoModule.snapshot(appContext), msg.optString("request_id"))
            }
            "LOCATION_REQUEST" -> {
                log("LOCATION_REQUEST received")
                LocationModule.requestOnce(appContext)
            }
            "INPUT_COMMAND" -> {
                val payload = msg.getJSONObject("payload")
                log("INPUT_COMMAND: ${payload.optString("action")}")
                val ok = RemoteControlService.dispatch(payload)
                send("INPUT_COMMAND_ACK", JSONObject().put("ok", ok), msg.optString("request_id"))
            }
            "LOCK_REQUEST" -> {
                log("LOCK_REQUEST received")
                val ok = LockAdminReceiver.lockNow(appContext)
                send("LOCK_RESPONSE", JSONObject().put("ok", ok), msg.optString("request_id"))
            }
            // Media streams. Screen needs a MediaProjection consent token, so the
            // agent asks MainActivity to run the system consent dialog first; mic
            // and camera start directly once their runtime permission is granted.
            "START_SCREEN" -> { log("START_SCREEN"); ScreenCaptureModule.start(appContext) }
            "STOP_SCREEN" -> { log("STOP_SCREEN"); ScreenCaptureModule.stop(appContext) }
            "START_CAMERA" -> {
                val facing = msg.optJSONObject("payload")?.optString("facing", "back") ?: "back"
                log("START_CAMERA ($facing)")
                CameraModule.start(appContext, facing)
            }
            "STOP_CAMERA" -> { log("STOP_CAMERA"); CameraModule.stop() }
            "START_MIC" -> { log("START_MIC"); MicModule.start(appContext) }
            "STOP_MIC" -> { log("STOP_MIC"); MicModule.stop() }
            "APPS_REQUEST" -> {
                log("APPS_REQUEST received")
                send("APPS_RESPONSE", AppsModule.listApps(appContext), msg.optString("request_id"))
            }
            "SET_APP_POLICY" -> {
                val p = msg.getJSONObject("payload")
                log("SET_APP_POLICY: ${p.optString("pkg")}")
                AppsModule.setPolicy(appContext, p.getString("pkg"), p.optBoolean("blocked"), p.optLong("limit_seconds"))
                send("APP_POLICY_ACK", p, msg.optString("request_id"))
            }
            "UNINSTALL_REQUEST" -> {
                val pkg = msg.getJSONObject("payload").getString("pkg")
                log("UNINSTALL_REQUEST: $pkg")
                AppsModule.requestUninstall(appContext, pkg)
                send("UNINSTALL_ACK", JSONObject().put("pkg", pkg).put("state", "prompted-on-device"), msg.optString("request_id"))
            }
            else -> log("unhandled message_type: $type")
        }
    }

    private fun sendCapabilities() {
        val caps = JSONObject().apply {
            put("push_to_sound", true)
            put("device_info", true)
            put("location", LocationModule.isAvailable(appContext))
            put("remote_input", RemoteControlService.isEnabled(appContext))
            put("lock", LockAdminReceiver.isActive(appContext))
            put("screen", true) // consent is per-session (Android 14+); capability is "offerable"
            put("camera", CameraModule.isAvailable(appContext))
            put("mic", MicModule.isAvailable(appContext))
            put("notifications", NotificationListenerModule.isEnabled(appContext))
            put("apps", true)
        }
        send("CAPABILITY_RESPONSE", caps)
    }

    /** Called by NotificationListenerModule when a notification is posted. */
    fun sendNotification(app: String, title: String, text: String) {
        send("NOTIFICATION_EVENT", JSONObject().apply {
            put("app", app); put("title", title); put("text", text); put("time", System.currentTimeMillis())
        })
    }

    fun reportLocation(lat: Double, lon: Double, accuracy: Float) {
        send("LOCATION_EVENT", JSONObject().apply {
            put("lat", lat); put("lon", lon); put("accuracy_m", accuracy)
        })
    }

    /** Called by the media modules to push a base64 frame/chunk to the controller. */
    fun sendFrame(type: String, mime: String, b64: String) {
        send(type, JSONObject().apply { put("mime", mime); put("b64", b64) })
    }
    fun sendMicChunk(pcmB64: String, sampleRate: Int) {
        send("MIC_CHUNK", JSONObject().apply { put("pcm_b64", pcmB64); put("sample_rate", sampleRate) })
    }
    fun sendStreamStatus(stream: String, state: String) {
        send("STREAM_STATUS", JSONObject().apply { put("stream", stream); put("state", state) })
    }

    private fun status(text: String) {
        mainHandler.post { statusListener?.onStatus(text) }
    }

    fun log(line: String) {
        mainHandler.post { statusListener?.onLog(line) }
    }
}
