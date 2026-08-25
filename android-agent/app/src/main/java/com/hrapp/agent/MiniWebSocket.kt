package com.hrapp.agent

import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64

/**
 * Minimal RFC 6455 WebSocket client (masked client text frames only, no TLS, no
 * fragmentation). Replaces OkHttp so the agent has zero third-party dependencies
 * and can be built without Gradle/AndroidX (ponytail — one fewer jar to resolve).
 * Ceiling: single blocking reader thread, one text frame per read; fine for the
 * relay's small JSON + base64 frames. Swap to OkHttp + wss:// for TLS in
 * production (MASTER.md §17).
 */
class MiniWebSocket(
    private val host: String,
    private val port: Int,
    private val path: String,
    private val listener: Listener
) {
    interface Listener {
        fun onOpen()
        fun onMessage(text: String)
        fun onFailure(t: Throwable)
        fun onClosed()
    }

    private var socket: Socket? = null
    private var out: OutputStream? = null
    private var input: InputStream? = null
    @Volatile private var running = true

    fun connectAsync() { Thread({ runLoop() }, "mini-ws").start() }

    private fun runLoop() {
        try {
            val s = Socket(host, port)
            socket = s
            out = s.getOutputStream()
            input = s.getInputStream()
            handshake()
            listener.onOpen()
            readLoop()
        } catch (e: Exception) {
            listener.onFailure(e)
        } finally {
            try { socket?.close() } catch (_: Exception) {}
            listener.onClosed()
        }
    }

    private fun handshake() {
        val keyBytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val key = Base64.getEncoder().encodeToString(keyBytes)
        val req = "GET $path HTTP/1.1\r\n" +
            "Host: $host:$port\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Key: $key\r\n" +
            "Sec-WebSocket-Version: 13\r\n\r\n"
        out!!.write(req.toByteArray(StandardCharsets.UTF_8)); out!!.flush()
        val reader = BufferedReader(InputStreamReader(input!!, StandardCharsets.UTF_8))
        var ok = false
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
            if (line.startsWith("HTTP/1.1 101")) ok = true
        }
        if (!ok) throw Exception("WebSocket handshake failed")
        // Note: Sec-WebSocket-Accept not validated — trusted dev relay only.
    }

    @Synchronized
    fun send(text: String) {
        try {
            val o = out ?: return
            val payload = text.toByteArray(StandardCharsets.UTF_8)
            val mask = ByteArray(4).also { SecureRandom().nextBytes(it) }
            val frame = ByteArrayOutputStream()
            frame.write(0x81) // FIN + text
            val len = payload.size
            when {
                len <= 125 -> frame.write(0x80 or len)
                len <= 65535 -> { frame.write(0x80 or 126); frame.write((len shr 8) and 0xFF); frame.write(len and 0xFF) }
                else -> { frame.write(0x80 or 127); for (i in 7 downTo 0) frame.write((len ushr (8 * i)) and 0xFF) }
            }
            frame.write(mask)
            for (i in 0 until len) frame.write(payload[i].toInt() xor mask[i % 4].toInt())
            o.write(frame.toByteArray()); o.flush()
        } catch (e: Exception) { listener.onFailure(e) }
    }

    private fun readLoop() {
        val ins = input!!
        while (running) {
            val b0 = ins.read(); if (b0 == -1) return
            val opcode = b0 and 0x0F
            val b1 = ins.read(); if (b1 == -1) return
            val masked = (b1 and 0x80) != 0
            var len = b1 and 0x7F
            if (len == 126) { len = (ins.read() shl 8) or ins.read() }
            else if (len == 127) { repeat(6) { ins.read() }; len = (ins.read() shl 8) or ins.read() }
            val maskKey = if (masked) ByteArray(4) { ins.read().toByte() } else null
            val payload = ByteArray(len)
            var read = 0
            while (read < len) { val r = ins.read(payload, read, len - read); if (r == -1) return; read += r }
            if (masked && maskKey != null) for (i in 0 until len) payload[i] = (payload[i].toInt() xor maskKey[i % 4].toInt()).toByte()
            when (opcode) {
                0x8 -> { running = false; return } // close
                0x1 -> listener.onMessage(String(payload, StandardCharsets.UTF_8)) // text
            }
        }
    }

    fun close() {
        running = false
        try { socket?.close() } catch (_: Exception) {}
    }
}
