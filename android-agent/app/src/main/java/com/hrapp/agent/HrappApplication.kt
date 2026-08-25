package com.hrapp.agent

import android.app.Application

/**
 * Process entry point. Boots the Agent singleton so the relay connection and
 * module router outlive any single Activity (MASTER.md §16 — connection must
 * survive the UI going to background).
 */
class HrappApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Agent.init(this)
    }
}
