package com.hrapp.agent

import android.app.Application
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.security.SecureRandom

private const val TAG = "HRAPP"

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    WS_OPEN,
    AUTHENTICATING,
    AUTHENTICATED,    // AUTH_OK but no pairing code yet / re-auth path
    PAIRING_REQUIRED, // waiting for user to enter code in controller
    PAIRED,           // controller has entered code, commands can flow
    RECONNECTING,
    STOPPING
}

object Agent {
    private const val PREF = "agent_config"
    private const val DEFAULT_PORT = 8787
    // Production relay URL — baked in so no user IP entry is needed.
    // Update this constant when deploying a stable Railway/Render endpoint.
    // Dev override: set relay_host in SharedPreferences via the hidden dev panel (5× tap on version).
    private const val PRODUCTION_RELAY = "wss://blink-jose-resolve-bulk.trycloudflare.com"
    // Remote config: APK fetches relay URL from controller on startup so cloudflared
    // URL changes don't require an APK rebuild — just update /relay.json on Vercel.
    private const val REMOTE_CONFIG_URL = "https://royal-kids-three.vercel.app/relay.json"

    interface StatusListener {
        fun onStatus(text: String)
        fun onPairingCode(code: String)
        fun onLog(line: String)
        fun onStateChange(state: ConnectionState) {}  // optional override
    }

    private var ws: MiniWebSocket? = null
    @Volatile private var connectGen = 0
    private val mainHandler = Handler(Looper.getMainLooper())
    var deviceId: String? = null
        private set
    private var statusListener: StatusListener? = null
    // Retained so onResume() can re-display the code if it arrived before the
    // listener was registered (race: Application.onCreate starts the WS before
    // MainActivity.onResume registers the callback).
    private var lastPairingCode: String? = null
    // True when sendPairInit() was called just to refresh the display code (phone already
    // authenticated). PAIR_INIT_RESPONSE should NOT call sendAuth() in that case.
    @Volatile private var pairInitForDisplay = false
    private lateinit var appContext: Application

    @Volatile var state: ConnectionState = ConnectionState.DISCONNECTED
        private set
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, cap 60s + jitter
    private var retryDelayMs = 2_000L
    // Dedicated IO thread: socket writes (send/sendBinary) must NOT happen on the
    // main thread — Android throws NetworkOnMainThreadException for any socket IO
    // on the main looper. All Agent.send() calls are dispatched here.
    private val ioThread = HandlerThread("hrapp-io").also { it.start() }
    private val ioHandler = Handler(ioThread.looper)

    private fun transition(next: ConnectionState) {
        val prev = state
        state = next
        Log.d(TAG, "STATE: $prev → $next [gen=$connectGen]")
        mainHandler.post { statusListener?.onStateChange(next) }
    }

    private fun scheduleReconnect(gen: Int) {
        val delay = retryDelayMs + (Math.random() * 1000).toLong() // jitter ±1s
        retryDelayMs = minOf(retryDelayMs * 2, 60_000L)
        Log.d(TAG, "reconnect scheduled: gen=$gen delay=${delay}ms (next=${retryDelayMs}ms)")
        fetchRemoteRelayConfig() // re-check relay URL on each backoff cycle
        mainHandler.postDelayed({ if (gen == connectGen) connect() }, delay)
    }

    private fun resetBackoff() { retryDelayMs = 2_000L }

    fun init(app: Application) {
        Log.d(TAG, "init: called, already=${::appContext.isInitialized}")
        if (::appContext.isInitialized) return
        appContext = app
        val hasStoredRelay = app.getSharedPreferences(PREF, Application.MODE_PRIVATE)
            .getString("configured_relay", null) != null
        if (hasStoredRelay) {
            // Returning install: connect immediately on stored URL, refresh config in background.
            connect()
            fetchRemoteRelayConfig()
        } else {
            // Fresh install: no relay URL yet. Fetch relay.json first — it calls connect()
            // once the URL is stored. PRODUCTION_RELAY fallback only if fetch fails.
            fetchRemoteRelayConfig()
        }
    }

    /** Fetches relay URL from the controller's /relay.json. Reconnects if it changed.
     *  This lets the relay URL be updated without rebuilding the APK. */
    private fun fetchRemoteRelayConfig() {
        Thread {
            try {
                val conn = java.net.URL(REMOTE_CONFIG_URL).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 5_000; conn.readTimeout = 5_000
                val relay = org.json.JSONObject(conn.inputStream.bufferedReader().readText()).getString("relay")
                if (!relay.startsWith("wss://") && !relay.startsWith("ws://")) return@Thread
                val prefs = appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
                if (prefs.getString("configured_relay", null) != relay) {
                    prefs.edit().putString("configured_relay", relay).apply()
                    Log.i(TAG, "Remote relay config updated: $relay")
                    mainHandler.post { connect() } // reconnect immediately with new URL
                }
            } catch (e: Exception) {
                Log.w(TAG, "Remote relay config fetch failed: ${e.message}")
                // Fresh install with no stored relay: fall back to PRODUCTION_RELAY
                val prefs = appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
                if (prefs.getString("configured_relay", null) == null) {
                    mainHandler.post { connect() }
                }
            }
        }.start()
    }

    fun setStatusListener(listener: StatusListener?) {
        Log.d(TAG, "setStatusListener: listener=${listener != null}, lastPairingCode=$lastPairingCode")
        statusListener = listener
        // Re-deliver any code that arrived before this listener was registered.
        if (listener != null) lastPairingCode?.let {
            Log.d(TAG, "setStatusListener: re-delivering lastPairingCode=$it")
            mainHandler.post { listener.onPairingCode(it) }
        }
    }

    fun getProductionRelayUrl() = PRODUCTION_RELAY

    fun getRelayHost(): String {
        val prefs = appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
        // Migrate away any stale LAN dev override regardless of priority.
        val devOverride = prefs.getString("relay_host", null)
        if (devOverride != null) {
            val host = devOverride.removePrefix("ws://").removePrefix("wss://").substringBefore(":")
            val isLan = host.matches(Regex("""(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.).*"""))
            if (isLan) {
                Log.w(TAG, "LAN relay address migrated away: $devOverride")
                prefs.edit().remove("relay_host").apply()
            }
        }
        // Remote-configured relay (centrally managed via /relay.json) — highest priority.
        // This ensures a relay URL update via Vercel is always used, even if a dev override exists.
        val remoteConfigured = prefs.getString("configured_relay", null)
        if (remoteConfigured != null) return remoteConfigured
        // Dev override (non-LAN) — fallback when relay.json hasn't been fetched yet.
        val currentOverride = prefs.getString("relay_host", null)
        if (currentOverride != null) return currentOverride
        // Built-in production fallback.
        return PRODUCTION_RELAY
    }

    /** Dev-only: override the relay URL (hidden panel in MainActivity). Reconnects. */
    fun setRelayHost(host: String) {
        appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE).edit()
            .putString("relay_host", host.trim().ifBlank { null }).commit()
        lastPairingCode = null
        connect()
    }

    /** Parse whatever the user typed into (tls, host, port). Accepts a bare IP,
     *  ws://host:port, or wss://domain. This is what makes internet (tunnel) work. */
    private fun parseTarget(raw: String): Triple<Boolean, String, Int> {
        var s = raw.trim()
        var tls = false
        if (s.startsWith("wss://") || s.startsWith("https://")) { tls = true; s = s.substringAfter("://") }
        else if (s.startsWith("ws://") || s.startsWith("http://")) { s = s.substringAfter("://") }
        s = s.substringBefore("/") // drop any path
        val host: String
        val port: Int
        if (s.contains(":")) { host = s.substringBefore(":"); port = s.substringAfter(":").toIntOrNull() ?: DEFAULT_PORT }
        else { host = s; port = if (tls) 443 else DEFAULT_PORT }
        return Triple(tls, host, port)
    }

    private fun connect() {
        val oldWs = ws
        val gen = ++connectGen
        val (tls, host, port) = parseTarget(getRelayHost())
        Log.d(TAG, "connect: gen=$gen host=$host port=$port tls=$tls")
        transition(ConnectionState.CONNECTING)
        status("connecting to $host…")
        val newWs = MiniWebSocket(host, port, "/", object : MiniWebSocket.Listener {
            override fun onOpen() {
                Log.d(TAG, "onOpen: gen=$gen WS_OPEN — checking stored device_id")
                if (gen != connectGen) { Log.w(TAG, "onOpen: stale gen=$gen, skip"); return }
                transition(ConnectionState.WS_OPEN)
                log("[PAIR] WS_OPEN")
                val stored = appContext.getSharedPreferences(PREF, 0).getString("device_id", null)
                // Full UUID logged for NET-002 real-device evidence (TASK-01 checklist items A-H)
                Log.i(TAG, "NET002 DEVICE_ID=${stored ?: "(null — fresh install)"}")
                if (stored != null) {
                    deviceId = stored
                    Log.d(TAG, "onOpen: re-auth path — sending AUTH_REQUEST device_id=$stored")
                    transition(ConnectionState.AUTHENTICATING)
                    log("[PAIR] have device_id — attempting re-auth")
                    sendAuth()
                } else {
                    Log.d(TAG, "onOpen: new-pair path — sending PAIR_INIT")
                    sendPairInit()
                }
            }
            override fun onMessage(text: String) {
                Log.d(TAG, "onMessage: gen=$gen ${text.take(120)}")
                if (gen != connectGen) return // stale connection, discard
                mainHandler.post { handleMessage(text) }
            }
            override fun onFailure(t: Throwable) {
                Log.e(TAG, "onFailure: gen=$gen ${t.javaClass.simpleName}: ${t.message}")
                if (gen != connectGen) return // stale, don't cascade
                transition(ConnectionState.RECONNECTING)
                val delay = retryDelayMs
                status("relay unreachable ($host:$port) — ${t.javaClass.simpleName} (retry ${delay/1000}s)")
                log("connection failed — retrying in ${delay/1000}s")
                scheduleReconnect(gen)
            }
            override fun onClosed() {
                Log.d(TAG, "onClosed: gen=$gen")
                if (gen != connectGen) return // stale socket — our close() call, ignore
                transition(ConnectionState.RECONNECTING)
                val delay = retryDelayMs
                status("disconnected — reconnecting in ${delay/1000}s")
                scheduleReconnect(gen)
            }
        }, tls)
        ws = newWs
        oldWs?.close() // close AFTER ws is reassigned so stale onFailure is ignored
        newWs.connectAsync()
    }

    fun send(json: JSONObject) {
        json.put("protocol_version", 1)
        json.put("timestamp", System.currentTimeMillis())
        val payload = json.toString()
        ioHandler.post { ws?.send(payload) }
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
            Log.i(TAG, "NET002 DEVICE_ID generated fresh: $id")
        } else {
            Log.i(TAG, "NET002 DEVICE_ID loaded from storage: $id")
        }
        return id
    }

    /** HMAC-SHA256 token matching relay's makeSessionToken(deviceId, secret). */
    private fun makeAgentToken(deviceId: String, secretHex: String): String {
        val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
            .joinToString("") { "%02x".format(it) }
        val secretBytes = secretHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secretBytes, "HmacSHA256"))
        val sig = mac.doFinal("$deviceId:$nonce".toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return "$nonce.$sig"
    }

    private fun storeDeviceSecret(secret: String) {
        appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE)
            .edit().putString("device_secret", secret).apply()
    }

    private fun loadDeviceSecret(): String? =
        appContext.getSharedPreferences(PREF, Application.MODE_PRIVATE).getString("device_secret", null)

    private fun sendPairInit() {
        deviceId = stableDeviceId()
        Log.d(TAG, "sendPairInit: device_id=${deviceId?.take(8)}")
        transition(ConnectionState.AUTHENTICATING)
        send(JSONObject().apply {
            put("message_type", "PAIR_INIT")
            put("request_id", UUID.randomUUID().toString())
            put("device_id", deviceId)
        })
    }

    private fun sendAuth() {
        val id = deviceId ?: return
        val secret = loadDeviceSecret()
        Log.d(TAG, "sendAuth: device_id=${id.take(8)} hasSecret=${secret != null}")
        val msg = JSONObject().apply {
            put("message_type", "AUTH_REQUEST")
            put("device_id", id)
            put("role", "agent")
            if (secret != null) {
                put("payload", JSONObject().put("session_token", makeAgentToken(id, secret)))
            }
        }
        send(msg)
    }

    private fun handleMessage(text: String) {
        val msg = try { JSONObject(text) } catch (e: Exception) { log("bad JSON from relay: ${e.message}"); return }
        when (val type = msg.optString("message_type")) {
            "PAIR_INIT_RESPONSE" -> {
                val payload = msg.getJSONObject("payload")
                deviceId = payload.getString("device_id")
                val code = payload.getString("pairing_code")
                // Store device_secret so we can authenticate on reconnect without re-pairing.
                payload.optString("device_secret").takeIf { it.isNotEmpty() }?.let { storeDeviceSecret(it) }
                Log.d(TAG, "PAIR_INIT_RESPONSE: device_id=${deviceId?.take(8)} code=$code")
                lastPairingCode = code
                transition(ConnectionState.PAIRING_REQUIRED)
                mainHandler.post {
                    Log.d(TAG, "PAIR_INIT_RESPONSE: posting onPairingCode($code) listener=${statusListener != null}")
                    statusListener?.onPairingCode(code)
                }
                log("pairing code issued: $code")
                if (pairInitForDisplay) {
                    // PAIR_INIT was for display refresh — already authenticated, skip sendAuth
                    pairInitForDisplay = false
                    transition(ConnectionState.AUTHENTICATED)
                    Log.i(TAG, "PAIR_INIT_RESPONSE: display refresh — skipping sendAuth, staying AUTHENTICATED")
                } else {
                    sendAuth()
                }
            }
            "AUTH_RESPONSE" -> {
                if (msg.optString("status") == "OK") {
                    Log.d(TAG, "AUTH_RESPONSE: OK — agent registered, code kept visible until controller pairs")
                    log("[PAIR] AUTH_OK — agent registered with relay, enter code on controller")
                    resetBackoff() // successful connection — reset exponential backoff
                    transition(ConnectionState.AUTHENTICATED)
                    status("enter code on controller: $lastPairingCode")
                    sendCapabilities()
                    // Refresh display code — phone is already authenticated, so flag
                    // PAIR_INIT_RESPONSE not to re-auth (would loop otherwise).
                    pairInitForDisplay = true
                    Log.i(TAG, "AUTH_OK — sendPairInit to refresh pairing code")
                    sendPairInit()
                } else {
                    // AUTH_FAILED: the relay doesn't recognize our credentials.
                    // If we have a stored device_id this is likely a relay-wipe or
                    // credential rotation — clear the stale secret and re-register.
                    // Never silently create a new device_id; clear explicitly first.
                    Log.w(TAG, "AUTH_RESPONSE: FAIL — clearing stale secret, re-registering same device_id")
                    log("[PAIR] AUTH failed — re-registering with relay")
                    appContext.getSharedPreferences(PREF, 0).edit()
                        .remove("device_secret").apply()
                    lastPairingCode = null
                    transition(ConnectionState.WS_OPEN)
                    sendPairInit()
                }
            }
            "PAIR_COMPLETE" -> {
                Log.d(TAG, "PAIR_COMPLETE: controller has paired — transitioning to PAIRED")
                transition(ConnectionState.PAIRED)
                status("paired with controller")
                log("[PAIR] controller paired — PAIRED")
            }
            "PLAY_SOUND" -> {
                val soundId = msg.optJSONObject("payload")?.optString("sound_id", "tan_tan") ?: "tan_tan"
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
                val payload = msg.optJSONObject("payload") ?: run { log("INPUT_COMMAND: missing payload"); return }
                val action = payload.optString("action")
                log("INPUT_COMMAND: $action")
                val ok = RemoteControlService.dispatch(payload)
                send("INPUT_COMMAND_ACK", JSONObject().put("ok", ok).put("action", action), msg.optString("request_id"))
            }
            "LOCK_REQUEST" -> {
                log("LOCK_REQUEST received")
                val ok = LockAdminReceiver.lockNow(appContext)
                send("LOCK_RESPONSE", JSONObject().put("ok", ok), msg.optString("request_id"))
            }
            // Media streams — routed through StreamSessionManager for lifecycle
            // isolation and backpressure. One stream failing cannot crash others.
            "START_SCREEN" -> { log("START_SCREEN"); StreamSessionManager.startScreen(appContext) }
            "STOP_SCREEN"  -> { log("STOP_SCREEN");  StreamSessionManager.stopScreen(appContext) }
            "START_CAMERA" -> {
                val facing = msg.optJSONObject("payload")?.optString("facing", "back") ?: "back"
                log("START_CAMERA ($facing)")
                StreamSessionManager.startCamera(appContext, facing)
            }
            "STOP_CAMERA" -> { log("STOP_CAMERA"); StreamSessionManager.stopCamera() }
            "START_MIC"   -> { log("START_MIC");   StreamSessionManager.startMic(appContext) }
            "STOP_MIC"    -> { log("STOP_MIC");    StreamSessionManager.stopMic() }
            "APPS_REQUEST" -> {
                log("APPS_REQUEST received")
                send("APPS_RESPONSE", AppsModule.listApps(appContext), msg.optString("request_id"))
            }
            "SET_APP_POLICY" -> {
                val p = msg.optJSONObject("payload") ?: run { log("SET_APP_POLICY: missing payload"); return }
                log("SET_APP_POLICY: ${p.optString("pkg")}")
                AppsModule.setPolicy(appContext, p.getString("pkg"), p.optBoolean("blocked"), p.optLong("limit_seconds"))
                send("APP_POLICY_ACK", p, msg.optString("request_id"))
            }
            "UNINSTALL_REQUEST" -> {
                val pkg = msg.optJSONObject("payload")?.optString("pkg") ?: run { log("UNINSTALL_REQUEST: missing pkg"); return }
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

    /** Called by the media modules to push a base64 frame/chunk to the controller.
     *  sendFrameBinary() is preferred — avoids ~33% base64 overhead. */
    fun sendFrame(type: String, mime: String, b64: String) {
        send(type, JSONObject().apply { put("mime", mime); put("b64", b64) })
    }
    fun sendMicChunk(pcmB64: String, sampleRate: Int) {
        send("MIC_CHUNK", JSONObject().apply { put("pcm_b64", pcmB64); put("sample_rate", sampleRate) })
    }

    /**
     * Binary frame protocol — 37-byte header + raw payload:
     *   [0]     frame_type byte: 0x01=CAMERA_FRAME, 0x02=MIC_CHUNK, 0x03=SCREEN_FRAME
     *   [1..36] device_id as 36-byte ASCII (UUID with dashes)
     *   [37..]  raw media bytes (JPEG or PCM)
     * Relay reads the header, routes to the paired controller socket.
     * Controller reads the same header format from its WebSocket binary message.
     */
    object BinaryFrameType {
        const val CAMERA: Byte = 0x01
        const val MIC: Byte = 0x02
        const val SCREEN: Byte = 0x03
    }

    fun sendFrameBinary(type: Byte, sampleRate: Int = 0, payload: ByteArray) {
        val id = deviceId ?: return
        val idBytes = id.toByteArray(Charsets.US_ASCII) // 36 bytes
        val header = ByteArray(1 + 36 + if (type == BinaryFrameType.MIC) 4 else 0)
        header[0] = type
        System.arraycopy(idBytes, 0, header, 1, 36)
        if (type == BinaryFrameType.MIC) {
            // embed sample_rate as 4 bytes big-endian after device_id
            header[37] = ((sampleRate shr 24) and 0xFF).toByte()
            header[38] = ((sampleRate shr 16) and 0xFF).toByte()
            header[39] = ((sampleRate shr 8) and 0xFF).toByte()
            header[40] = (sampleRate and 0xFF).toByte()
        }
        val frame = ByteArray(header.size + payload.size)
        System.arraycopy(header, 0, frame, 0, header.size)
        System.arraycopy(payload, 0, frame, header.size, payload.size)
        ioHandler.post { ws?.sendBinary(frame) }
    }
    fun sendStreamStatus(stream: String, state: String) {
        StreamSessionManager.onStreamStatus(stream, state)
        send("STREAM_STATUS", JSONObject().apply { put("stream", stream); put("state", state) })
    }

    private fun status(text: String) {
        mainHandler.post { statusListener?.onStatus(text) }
    }

    fun log(line: String) {
        mainHandler.post { statusListener?.onLog(line) }
    }
}
