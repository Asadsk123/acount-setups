package com.hrapp.agent

import android.app.Application
import android.util.Log

/**
 * Process entry point. Boots the Agent singleton so the relay connection and
 * module router outlive any single Activity (MASTER.md §16 — connection must
 * survive the UI going to background).
 */
class HrappApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Log.d("HRAPP", "HrappApplication.onCreate — calling Agent.init")
        Agent.init(this)
        Log.d("HRAPP", "HrappApplication.onCreate — Agent.init returned, WS connecting async")
    }
}
