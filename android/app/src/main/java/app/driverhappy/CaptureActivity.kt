package app.driverhappy

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle

class CaptureActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val consent = if (Build.VERSION.SDK_INT >= 34) {
            manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
            manager.createScreenCaptureIntent()
        }
        @Suppress("DEPRECATION")
        startActivityForResult(consent, 40)
    }

    @Deprecated("El permiso de captura llega por este resultado")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 40 && resultCode == RESULT_OK && data != null) {
            startForegroundService(
                Intent(this, OverlayService::class.java).apply {
                    action = OverlayService.ACTION_ARM
                    putExtra(OverlayService.EXTRA_CODE, resultCode)
                    putExtra(OverlayService.EXTRA_DATA, data)
                    putExtra(OverlayService.EXTRA_SHOOT, intent.getBooleanExtra(OverlayService.EXTRA_SHOOT, false))
                },
            )
        } else {
            startService(Intent(this, OverlayService::class.java).setAction(OverlayService.ACTION_CANCEL))
        }
        finish()
    }
}
