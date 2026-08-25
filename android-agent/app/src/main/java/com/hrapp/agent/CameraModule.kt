package com.hrapp.agent

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import androidx.core.app.ActivityCompat

/**
 * Live camera → JPEG frames to the controller (MASTER.md §27 planned interface).
 * Camera2 with an ImageReader(JPEG) capturing at low rate. Requires the CAMERA
 * runtime permission (user-granted) and, on Android, the OS shows the camera
 * privacy indicator the whole time — which MASTER.md §50 requires we never hide.
 *
 * ponytail: back camera, ~2 fps repeating JPEG capture, base64 over JSON. No
 * preview surface, no resolution negotiation beyond "smallest JPEG size". Same
 * upgrade path as screen (hardware encode + binary) when it's worth it.
 */
object CameraModule {
    private var cameraDevice: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var bgThread: HandlerThread? = null
    private var bgHandler: Handler? = null
    @Volatile private var running = false
    private var lastFrameAt = 0L

    fun isAvailable(context: Context): Boolean {
        val granted = ActivityCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        return granted && cm.cameraIdList.isNotEmpty()
    }

    fun start(context: Context) {
        if (running) return
        if (!isAvailable(context)) { Agent.log("START_CAMERA denied: CAMERA not granted / no camera"); return }
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = cm.cameraIdList.firstOrNull {
            cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: cm.cameraIdList.first()

        bgThread = HandlerThread("hrapp-camera").also { it.start() }
        bgHandler = Handler(bgThread!!.looper)

        val sizes = cm.getCameraCharacteristics(cameraId)
            .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)!!
            .getOutputSizes(ImageFormat.JPEG)
        val size = sizes.minByOrNull { it.width.toLong() * it.height } ?: sizes.first()

        reader = ImageReader.newInstance(size.width, size.height, ImageFormat.JPEG, 2).apply {
            setOnImageAvailableListener({ r ->
                val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    val now = System.currentTimeMillis()
                    if (now - lastFrameAt >= 500) { // ~2 fps
                        lastFrameAt = now
                        val buf = image.planes[0].buffer
                        val bytes = ByteArray(buf.remaining()); buf.get(bytes)
                        Agent.sendFrame("CAMERA_FRAME", "image/jpeg", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    }
                } finally { image.close() }
            }, bgHandler)
        }

        try {
            cm.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    cameraDevice = camera
                    val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                        .apply { addTarget(reader!!.surface) }
                    camera.createCaptureSession(listOf(reader!!.surface), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            session = s
                            running = true
                            Agent.sendStreamStatus("camera", "started")
                            // Repeating still-capture request drives the ~2 fps stream.
                            s.setRepeatingRequest(request.build(), null, bgHandler)
                        }
                        override fun onConfigureFailed(s: CameraCaptureSession) { Agent.log("camera session failed") }
                    }, bgHandler)
                }
                override fun onDisconnected(camera: CameraDevice) { camera.close() }
                override fun onError(camera: CameraDevice, error: Int) { Agent.log("camera error $error"); camera.close() }
            }, bgHandler)
        } catch (e: SecurityException) { Agent.log("camera open failed: ${e.message}") }
    }

    fun stop() {
        if (!running) return
        running = false
        session?.close(); session = null
        cameraDevice?.close(); cameraDevice = null
        reader?.close(); reader = null
        bgThread?.quitSafely(); bgThread = null; bgHandler = null
        Agent.sendStreamStatus("camera", "stopped")
    }
}
