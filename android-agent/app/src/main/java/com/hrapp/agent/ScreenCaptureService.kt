package com.hrapp.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Base64
import android.util.DisplayMetrics
import java.io.ByteArrayOutputStream

/**
 * Foreground service that captures the screen via MediaProjection and streams
 * downscaled JPEG frames to the controller. Runs as a mediaProjection
 * foreground service with a visible notification — the platform requires it and
 * MASTER.md §19/§50 wants the capture visible, not hidden.
 *
 * ponytail: ImageReader → Bitmap → JPEG at ~3 fps, capped width 720px. No
 * hardware H.264 encoder, no adaptive bitrate yet (MASTER.md §11 lists those as
 * the optimization phase). This is the smallest thing that puts the real screen
 * on the controller; the encoder upgrade is a later, isolated change.
 */
class ScreenCaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    @Volatile private var lastFrameAt = 0L
    private val minFrameGapMs = 333L // ~3 fps

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundNotification()
        val resultCode = intent?.getIntExtra("resultCode", 0) ?: 0
        val resultData = intent?.getParcelableExtra<Intent>("resultData")
        if (resultData == null) { stopSelf(); return START_NOT_STICKY }

        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = mpm.getMediaProjection(resultCode, resultData)
        startCapture()
        Agent.sendStreamStatus("screen", "started")
        return START_NOT_STICKY
    }

    private fun startCapture() {
        val metrics = resources.displayMetrics
        val scale = minOf(1f, 720f / maxOf(metrics.widthPixels, 1))
        val w = (metrics.widthPixels * scale).toInt().coerceAtLeast(1)
        val h = (metrics.heightPixels * scale).toInt().coerceAtLeast(1)

        val reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        imageReader = reader
        reader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastFrameAt >= minFrameGapMs) {
                    lastFrameAt = now
                    val plane = image.planes[0]
                    val rowStride = plane.rowStride
                    val bmp = Bitmap.createBitmap(rowStride / plane.pixelStride, h, Bitmap.Config.ARGB_8888)
                    bmp.copyPixelsFromBuffer(plane.buffer)
                    val out = ByteArrayOutputStream()
                    Bitmap.createBitmap(bmp, 0, 0, w, h).compress(Bitmap.CompressFormat.JPEG, 50, out)
                    Agent.sendFrame("SCREEN_FRAME", "image/jpeg", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
                    bmp.recycle()
                }
            } finally { image.close() }
        }, null)

        virtualDisplay = projection?.createVirtualDisplay(
            "hrapp-screen", w, h, metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, null
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        virtualDisplay?.release()
        imageReader?.close()
        projection?.stop()
    }

    private fun startForegroundNotification() {
        val channelId = "hrapp_screen"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(channelId, "Screen sharing", NotificationManager.IMPORTANCE_LOW))
        }
        val n: Notification = Notification.Builder(this, channelId)
            .setContentTitle("HRAPP — screen sharing active")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(1, n)
        }
    }
}
