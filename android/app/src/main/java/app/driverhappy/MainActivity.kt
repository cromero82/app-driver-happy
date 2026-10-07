package app.driverhappy

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.SeekBar
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var server: EditText
    private lateinit var panel: WebView
    private lateinit var note: TextView
    private lateinit var allowOverlay: Button
    private lateinit var allowCapture: Button
    private lateinit var floatY: SeekBar
    private var movingFloat = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        server = findViewById(R.id.server)
        panel = findViewById(R.id.panel)
        note = findViewById(R.id.permission_note)
        allowOverlay = findViewById(R.id.allow_overlay)
        allowCapture = findViewById(R.id.allow_capture)
        server.setText(DriverPrefs.server(this))
        panel.settings.javaScriptEnabled = true
        panel.settings.domStorageEnabled = true
        panel.webViewClient = WebViewClient()
        panel.addJavascriptInterface(ConfigBridge(applicationContext), "AndroidConfig")
        allowOverlay.setOnClickListener { askOverlay() }
        allowCapture.setOnClickListener {
            try {
                startActivity(ShotService.settings(this))
            } catch (_: Exception) {
            }
        }
        findViewById<Button>(R.id.float_mode).setOnClickListener { enterFloat() }
        floatY = findViewById(R.id.float_y)
        val top = (48 * resources.displayMetrics.density).toInt()
        floatY.max = (resources.displayMetrics.heightPixels - (80 * resources.displayMetrics.density).toInt()).coerceAtLeast(top)
        val saved = DriverPrefs.floatY(this)
        floatY.progress = if (saved < 0) top else saved.coerceIn(0, floatY.max)
        floatY.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                DriverPrefs.saveFloatY(this@MainActivity, progress)
                OverlayService.moveVertical(this@MainActivity, progress)
            }

            override fun onStartTrackingTouch(bar: SeekBar) {
                movingFloat = true
                if (!Settings.canDrawOverlays(this@MainActivity)) {
                    askOverlay()
                    return
                }
                OverlayService.moveVertical(this@MainActivity, bar.progress)
            }

            override fun onStopTrackingTouch(bar: SeekBar) {
                movingFloat = false
                if (OverlayService.running) OverlayService.hide(this@MainActivity)
            }
        })
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41)
        }
        loadPanel(DriverPrefs.server(this))
        pinDesktopIcon()
    }

    private fun pinDesktopIcon() {
        val shortcuts = getSystemService(ShortcutManager::class.java) ?: return
        if (shortcuts.pinnedShortcuts.any { it.id == "escritorio" }) return
        if (!shortcuts.isRequestPinShortcutSupported) return
        val launch = Intent(this, MainActivity::class.java).setAction(Intent.ACTION_MAIN)
        val info = ShortcutInfo.Builder(this, "escritorio")
            .setShortLabel("Asistente")
            .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
            .setIntent(launch)
            .build()
        shortcuts.requestPinShortcut(info, null)
    }

    override fun onResume() {
        super.onResume()
        refreshPermissions()
        val savedY = DriverPrefs.floatY(this)
        if (savedY >= 0) floatY.progress = savedY.coerceIn(0, floatY.max)
        if (OverlayService.running && !movingFloat) OverlayService.hide(this)
    }

    override fun onUserLeaveHint() {
        if (OverlayService.running) OverlayService.show(this)
    }

    @Deprecated("El permiso de captura llega por este resultado")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 40) return
        if (resultCode == RESULT_OK && data != null) {
            startForegroundService(
                Intent(this, OverlayService::class.java).apply {
                    action = OverlayService.ACTION_ARM
                    putExtra(OverlayService.EXTRA_CODE, resultCode)
                    putExtra(OverlayService.EXTRA_DATA, data)
                },
            )
            moveTaskToBack(true)
        }
    }

    private fun refreshPermissions() {
        val overlay = Settings.canDrawOverlays(this)
        allowOverlay.visibility = if (overlay) View.GONE else View.VISIBLE
        val capture = ShotService.ready(this)
        allowCapture.visibility = if (capture) View.GONE else View.VISIBLE
        note.visibility = if (overlay && capture) View.GONE else View.VISIBLE
    }

    private fun saveUrl(): String {
        val url = normalizeServer(server.text.toString())
        server.setText(url)
        DriverPrefs.saveServer(this, url)
        loadPanel(url)
        return url
    }

    private fun loadPanel(url: String) {
        if (url.isEmpty()) return
        val current = panel.url ?: ""
        if (current == url || current == "$url/") return
        panel.loadUrl(url)
    }

    private fun askOverlay() {
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    private fun enterFloat() {
        saveUrl()
        if (!Settings.canDrawOverlays(this)) {
            askOverlay()
            return
        }
        if (!OverlayService.running) {
            startForegroundService(Intent(this, OverlayService::class.java).setAction(OverlayService.ACTION_FLOAT))
        } else {
            OverlayService.show(this)
        }
        moveTaskToBack(true)
    }
}

class ConfigBridge(private val app: Context) {
    @JavascriptInterface
    fun save(json: String) {
        DriverPrefs.saveContext(app, json)
    }
}
