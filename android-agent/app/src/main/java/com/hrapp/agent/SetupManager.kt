package com.hrapp.agent

import android.content.Context

/**
 * Persists one-time setup state across installs/updates.
 * Uses SharedPreferences keyed to a setup_version so a T&C bump can
 * require re-acceptance without wiping device identity or pairing.
 *
 * DEVICE_ID and pairing live in Agent/relay — SetupManager only tracks
 * what the local onboarding wizard has completed.
 */
object SetupManager {
    private const val PREF = "hrapp_setup"
    private const val CURRENT_TERMS_VERSION = 1

    enum class Stage {
        FRESH,         // nothing persisted
        TERMS_ACCEPTED,
        PERMISSIONS_DONE,
        RELAY_CONFIGURED,
        COMPLETE
    }

    data class SetupState(
        val stage: Stage,
        val termsVersion: Int,
        val acceptedAt: Long,   // epoch ms; 0 = not accepted
        val relayHost: String?
    )

    fun load(ctx: Context): SetupState {
        val p = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val stage = try { Stage.valueOf(p.getString("stage", Stage.FRESH.name)!!) } catch (_: Exception) { Stage.FRESH }
        return SetupState(
            stage = stage,
            termsVersion = p.getInt("terms_version", 0),
            acceptedAt = p.getLong("accepted_at", 0L),
            relayHost = p.getString("relay_host", null)
        )
    }

    fun acceptTerms(ctx: Context) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString("stage", Stage.TERMS_ACCEPTED.name)
            .putInt("terms_version", CURRENT_TERMS_VERSION)
            .putLong("accepted_at", System.currentTimeMillis())
            .commit()
    }

    fun markPermissionsDone(ctx: Context) {
        advance(ctx, Stage.PERMISSIONS_DONE)
    }

    fun markRelayConfigured(ctx: Context) {
        advance(ctx, Stage.RELAY_CONFIGURED)
    }

    fun markComplete(ctx: Context) {
        advance(ctx, Stage.COMPLETE)
    }

    fun needsTerms(ctx: Context): Boolean {
        val s = load(ctx)
        return s.termsVersion < CURRENT_TERMS_VERSION
    }

    fun isComplete(ctx: Context): Boolean = load(ctx).stage == Stage.COMPLETE

    private fun advance(ctx: Context, next: Stage) {
        val current = load(ctx).stage
        // Only advance, never go backwards (protects against concurrent calls)
        if (next.ordinal > current.ordinal) {
            ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
                .putString("stage", next.name).commit()
        }
    }
}
