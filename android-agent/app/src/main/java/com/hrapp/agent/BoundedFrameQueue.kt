package com.hrapp.agent

import android.util.Log
import java.util.concurrent.ArrayBlockingQueue

/**
 * Drop-oldest bounded queue for real-time media frames.
 * Never grows without bound — when the network is slow we drop stale frames
 * rather than accumulate memory until OOM.
 *
 * Policy: DROP_OLDEST (for video/screen — stale frame is useless)
 * Control messages must NOT go through this queue (they use Agent.send directly).
 */
class BoundedFrameQueue(private val tag: String, capacity: Int) {
    private val queue = ArrayBlockingQueue<() -> Unit>(capacity)
    @Volatile private var dropped = 0L
    @Volatile private var sent = 0L

    /** Enqueue a send action. Drops the oldest entry if full. */
    fun offer(action: () -> Unit) {
        if (!queue.offer(action)) {
            // Queue full — drop oldest (head), enqueue new
            queue.poll()
            dropped++
            queue.offer(action)
            if (dropped % 100 == 1L) {
                Log.w("HRAPP", "[$tag] backpressure: dropped $dropped frames total")
            }
        }
    }

    /** Drain and execute all pending actions. Call from the WS-send thread. */
    fun drain() {
        var action = queue.poll()
        while (action != null) {
            try { action(); sent++ } catch (_: Exception) {}
            action = queue.poll()
        }
    }

    /** Clear queue on stream stop — don't send stale frames after stop. */
    fun clear() { queue.clear() }

    fun stats(): String = "sent=$sent dropped=$dropped queued=${queue.size}"
}
