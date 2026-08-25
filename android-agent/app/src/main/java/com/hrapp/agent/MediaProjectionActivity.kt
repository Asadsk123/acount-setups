package com.hrapp.agent

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle

/**
 * Transparent activity whose only job is to run the system MediaProjection
 * consent dialog and hand the result to ScreenCaptureService. Kept separate so
 * the consent flow (which must be user-visible, MASTER.md §19) is not buried in
 * the capture service.
 */
class MediaProjectionActivity : Activity() {
    private val mpm by lazy { getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ && resultCode == RESULT_OK && data != null) {
            val svc = Intent(this, ScreenCaptureService::class.java)
                .putExtra("resultCode", resultCode)
                .putExtra("resultData", data)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
        } else {
            Agent.log("screen consent denied")
            Agent.sendStreamStatus("screen", "denied")
        }
        finish()
    }

    companion object { private const val REQ = 7001 }
}
