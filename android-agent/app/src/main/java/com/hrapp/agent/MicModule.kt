package com.hrapp.agent

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder

/**
 * Live microphone → PCM chunks to the controller (MASTER.md §11). Explicit,
 * visible capture — no silent recording (MASTER.md §21 non-goal). Requires the
 * RECORD_AUDIO runtime permission, which the user grants by hand.
 *
 * ponytail: raw 16-bit PCM at 8 kHz over binary WebSocket frames (no base64).
 * Upgrade path: Opus encode when bandwidth matters.
 */
object MicModule {
    private const val SAMPLE_RATE = 8000
    @Volatile private var recording = false
    private var thread: Thread? = null

    fun isAvailable(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun start(context: Context) {
        if (recording) return
        if (!isAvailable(context)) { Agent.log("START_MIC denied: RECORD_AUDIO not granted"); return }

        val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val chunkSamples = SAMPLE_RATE / 10 // 100 ms
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                maxOf(minBuf, chunkSamples * 2)
            )
        } catch (e: SecurityException) { Agent.log("mic SecurityException: ${e.message}"); return }
          catch (e: Exception) { Agent.log("mic init failed: ${e.message}"); return }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            Agent.log("mic AudioRecord STATE_UNINITIALIZED — hardware busy or permission missing"); return
        }

        recording = true
        Agent.sendStreamStatus("mic", "started")
        thread = Thread {
            val buf = ShortArray(chunkSamples)
            record.startRecording()
            while (recording) {
                val n = record.read(buf, 0, buf.size)
                if (n < 0) {
                    Agent.log("mic read error: $n — stopping")
                    recording = false; break
                }
                if (n > 0) {
                    val bytes = ByteArray(n * 2)
                    for (i in 0 until n) {
                        bytes[i * 2] = (buf[i].toInt() and 0xFF).toByte()
                        bytes[i * 2 + 1] = (buf[i].toInt() shr 8).toByte()
                    }
                    // Binary mic frame — no base64 overhead
                    StreamSessionManager.micQueue.offer {
                        Agent.sendFrameBinary(Agent.BinaryFrameType.MIC, SAMPLE_RATE, bytes)
                    }
                    StreamSessionManager.micQueue.drain()
                }
            }
            record.stop(); record.release()
        }.also { it.start() }
    }

    fun stop() {
        if (!recording) return
        recording = false
        thread?.join(500); thread = null
        Agent.sendStreamStatus("mic", "stopped")
    }
}
