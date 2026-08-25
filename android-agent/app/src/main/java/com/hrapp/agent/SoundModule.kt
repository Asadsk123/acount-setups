package com.hrapp.agent

import android.content.Context
import android.media.MediaPlayer

object SoundModule {
    private var mediaPlayer: MediaPlayer? = null

    fun play(context: Context, soundId: String) {
        mediaPlayer?.release()
        // ponytail: single bundled sound regardless of soundId, per ADR-0004
        // (Option A — predefined sound only). Map soundId -> resource when a
        // second sound is actually needed.
        mediaPlayer = MediaPlayer.create(context, R.raw.tan_tan)
        mediaPlayer?.setOnCompletionListener { it.release() }
        mediaPlayer?.start()
    }
}
