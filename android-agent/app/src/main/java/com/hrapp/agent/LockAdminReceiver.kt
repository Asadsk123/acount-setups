package com.hrapp.agent

import android.app.admin.DevicePolicyManager
import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context

/**
 * Remote LOCK, MASTER.md §25-ish. DevicePolicyManager.lockNow() is the honest,
 * OS-sanctioned way for an authorized app to lock the screen — it requires the
 * user to enable this app as a Device Admin (Settings prompt, revocable).
 *
 * IMPORTANT — remote UNLOCK is deliberately absent. Android provides no API for
 * a third-party (non-Device-Owner) app to dismiss the keyguard or enter the
 * user's credential. Any "remote unlock" would require a credential bypass,
 * which MASTER.md §17/§50 forbids. Lock is offered; unlock is not, by design.
 */
class LockAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private fun component(context: Context) =
            ComponentName(context, LockAdminReceiver::class.java)

        fun isActive(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            return dpm.isAdminActive(component(context))
        }

        /** Returns false (not throw) if admin isn't active, so the caller can
         *  tell the controller the lock did not happen. */
        fun lockNow(context: Context): Boolean {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            if (!dpm.isAdminActive(component(context))) return false
            dpm.lockNow()
            return true
        }
    }
}
