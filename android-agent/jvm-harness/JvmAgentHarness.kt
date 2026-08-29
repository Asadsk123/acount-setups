// Phone-less verification of the AGENT'S OWN networking code.
// This compiles the REAL MiniWebSocket.kt from the app and drives it against
// the real relay on the desktop JVM — proving the pairing + command-handling
// path the app uses actually works, without an Android device.
// (Android-hardware parts — camera/mic/screen capture — genuinely cannot run
// off-device and stay NOT VERIFIED.)
package com.hrapp.agent

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object Harness {
    @JvmStatic
    fun main(args: Array<String>) {
        val host = if (args.isNotEmpty()) args[0] else "localhost"
        val port = if (args.size > 1) args[1].toInt() else 8787
        val deviceId = "jvm-harness-device"
        var pairingCode: String? = null
        var authOk = false
        var gotPlaySound = false
        val ready = CountDownLatch(1)
        val played = CountDownLatch(1)
        var ws: MiniWebSocket? = null

        fun send(json: String) { ws?.send(json) }

        ws = MiniWebSocket(host, port, "/", object : MiniWebSocket.Listener {
            override fun onOpen() {
                println("[harness] relay connected -> PAIR_INIT")
                send("""{"message_type":"PAIR_INIT","request_id":"h1","device_id":"$deviceId","protocol_version":1}""")
            }
            override fun onMessage(text: String) {
                when {
                    text.contains("\"PAIR_INIT_RESPONSE\"") -> {
                        pairingCode = Regex("\"pairing_code\":\"(\\d+)\"").find(text)?.groupValues?.get(1)
                        println("[harness] got pairing code: $pairingCode -> AUTH_REQUEST")
                        send("""{"message_type":"AUTH_REQUEST","device_id":"$deviceId","role":"agent","protocol_version":1}""")
                    }
                    text.contains("\"AUTH_RESPONSE\"") && text.contains("\"OK\"") -> {
                        authOk = true
                        println("[harness] AUTH ok — agent ready, waiting for commands")
                        ready.countDown()
                    }
                    text.contains("\"PLAY_SOUND\"") -> {
                        gotPlaySound = true
                        println("[harness] received PLAY_SOUND -> replying PLAY_SOUND_RESULT")
                        send("""{"message_type":"PLAY_SOUND_RESULT","device_id":"$deviceId","payload":{"result":"PLAYED"},"protocol_version":1}""")
                        played.countDown()
                    }
                }
            }
            override fun onFailure(t: Throwable) { println("[harness] FAIL: ${t.message}") }
            override fun onClosed() { println("[harness] closed") }
        }, tls = (port == 443))
        ws.connectAsync()

        if (!ready.await(10, TimeUnit.SECONDS)) { println("RESULT: FAIL — agent did not reach ready (pair/auth)"); System.exit(1) }
        // Signal to the external controller that we're paired and print the code for it.
        println("HARNESS_READY code=$pairingCode device=$deviceId")

        // Wait for a PLAY_SOUND to arrive (the node controller sends it).
        if (!played.await(15, TimeUnit.SECONDS)) { println("RESULT: FAIL — no PLAY_SOUND received"); System.exit(1) }
        Thread.sleep(300)
        println("RESULT: PASS — real MiniWebSocket connected, paired, authed, received PLAY_SOUND and replied")
        System.exit(0)
    }
}
