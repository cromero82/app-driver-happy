package app.driverhappy

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.ByteArrayOutputStream

class OverlayService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private val captureThread = HandlerThread("captura").apply { start() }
    private val captureHandler = Handler(captureThread.looper)
    private val windowManager by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private val frameLock = Object()
    private var acceptFrame = false
    private var frameJpeg: ByteArray? = null
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var panel: View? = null
    private var rows: LinearLayout? = null
    private var scroll: ScrollView? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var attached = false
    private var busy = false
    private var closing = false
    private var projectionGeneration = 0
    private var shotId = 0
    private var shotServer = ""
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_HIDE -> panel?.visibility = View.GONE
            ACTION_SHOW -> if (attached) panel?.visibility = View.VISIBLE
            ACTION_MOVE -> {
                startFloat()
                moveTo(intent.getIntExtra(EXTRA_Y, savedFloatY()))
            }
            ACTION_FLOAT -> startFloat()
            ACTION_ARM, ACTION_SHOT -> arm(intent)
            ACTION_CANCEL -> abortShot()
            ACTION_START -> startFloat()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        closing = true
        running = false
        sharing = false
        detach()
        display?.release()
        display = null
        reader?.close()
        reader = null
        projection?.stop()
        projection = null
        captureThread.quitSafely()
        super.onDestroy()
    }

    private fun startFloat() {
        enterForeground(projecting = false)
        running = true
        ensurePanel()
        panel?.visibility = View.VISIBLE
    }

    private fun ensurePanel() {
        if (panel != null) {
            if (!attached) attach()
            return
        }
        val view = buildPanel()
        panel = view
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        val params = WindowManager.LayoutParams(
            (metrics.widthPixels * 3) / 4,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = (metrics.widthPixels - params.width - px(6)).coerceAtLeast(0)
        params.y = savedFloatY()
        layoutParams = params
        windowManager.addView(view, params)
        attached = true
    }

    private fun arm(intent: Intent) {
        val shootAfter = intent.getBooleanExtra(EXTRA_SHOOT, false)
        val code = intent.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED)
        val data = parcelableIntent(intent)
        if (code != Activity.RESULT_OK || data == null) {
            if (shootAfter) abortShot()
            return
        }
        if (projection == null) {
            try {
                enterForeground(projecting = true)
                val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                val session = manager.getMediaProjection(code, data)
                val generation = ++projectionGeneration
                session.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        if (!closing && generation == projectionGeneration) main.post { onProjectionStopped() }
                    }
                }, main)
                projection = session
                sharing = true
            } catch (_: Exception) {
                sharing = false
                if (shootAfter) abortShot()
                return
            }
        }
        if (shootAfter) beginGrab(400) else ensurePanel()
    }

    private fun enterForeground(projecting: Boolean) {
        val notice = notification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, notice, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, notice)
        }
    }

    private fun openDisplay() {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        @Suppress("DEPRECATION")
        val images = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3)
        images.setOnImageAvailableListener({ source ->
            val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val take = synchronized(frameLock) { acceptFrame }
                if (!take) return@setOnImageAvailableListener
                val jpeg = jpegFrom(image)
                synchronized(frameLock) {
                    if (acceptFrame) {
                        frameJpeg = jpeg
                        acceptFrame = false
                        frameLock.notifyAll()
                    }
                }
            } finally {
                image.close()
            }
        }, captureHandler)
        closeDisplay()
        reader = images
        display = projection?.createVirtualDisplay(
            "asistente",
            width,
            height,
            metrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            images.surface,
            null,
            captureHandler,
        )
    }

    private fun buildPanel(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = plate()
            setPadding(px(4), px(4), px(4), px(4))
        }
        val handle = ImageView(this).apply {
            setImageResource(R.drawable.ic_launcher_art)
            contentDescription = "Mover"
            setOnTouchListener { _, event -> drag(event) }
        }
        bar.addView(handle, LinearLayout.LayoutParams(px(28), px(28)))
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        rows = list
        val scroller = ScrollView(this).apply {
            isVerticalScrollBarEnabled = false
            addView(list)
        }
        scroll = scroller
        bar.addView(scroller, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = px(4) })
        val actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        actions.addView(action(R.drawable.ic_capture, "Capturar") { shoot() })
        actions.addView(space(px(4)))
        actions.addView(action(R.drawable.ic_gear, "Configurar") { openFull() })
        bar.addView(actions, LinearLayout.LayoutParams(px(36), LinearLayout.LayoutParams.WRAP_CONTENT).apply { marginStart = px(4) })
        return bar
    }

    private fun shoot() {
        if (busy || !attached) return
        val server = DriverPrefs.server(this)
        if (server.isEmpty()) {
            showMessage("Falta la dirección del Mac")
            return
        }
        val shot = ShotService.instance
        if (shot == null) {
            openCaptureSettings()
            return
        }
        shotServer = server
        busy = true
        detach()
        main.postDelayed({
            try {
                shot.capture { bitmap ->
                    val jpeg = bitmap?.let { jpegFromBitmap(it) }
                    main.post {
                        attach()
                        if (jpeg == null) {
                            busy = false
                            showMessage("No se pudo tomar la pantalla")
                        } else {
                            upload(server, jpeg)
                        }
                    }
                }
            } catch (_: Exception) {
                main.post {
                    attach()
                    busy = false
                    showMessage("No se pudo tomar la pantalla")
                }
            }
        }, 220)
    }

    private fun beginGrab(delayMs: Long) {
        val id = shotId
        try {
            openDisplay()
        } catch (_: Exception) {
            abortShot()
            return
        }
        main.postDelayed({
            Thread {
                val jpeg = waitFrame()
                main.post { if (id == shotId) finishShot(jpeg) }
            }.start()
        }, delayMs)
    }

    private fun finishShot(jpeg: ByteArray?) {
        val server = shotServer
        closeDisplay()
        attach()
        if (jpeg == null) {
            busy = false
            showMessage("No se pudo tomar la pantalla")
        } else {
            upload(server, jpeg)
        }
    }

    private fun abortShot() {
        shotId++
        closeDisplay()
        busy = false
        if (panel != null) attach()
    }

    private fun onProjectionStopped() {
        projectionGeneration++
        sharing = false
        projection = null
        shotId++
        closeDisplay()
        busy = false
        if (panel != null) attach()
        if (running) enterForeground(projecting = false)
    }

    private fun closeDisplay() {
        display?.release()
        display = null
        reader?.close()
        reader = null
        synchronized(frameLock) {
            acceptFrame = false
            frameJpeg = null
        }
    }

    private fun waitFrame(): ByteArray? {
        synchronized(frameLock) {
            frameJpeg = null
            acceptFrame = true
            val deadline = System.currentTimeMillis() + 2000
            while (frameJpeg == null && System.currentTimeMillis() < deadline) {
                val left = deadline - System.currentTimeMillis()
                if (left <= 0) break
                frameLock.wait(left)
            }
            acceptFrame = false
            return frameJpeg
        }
    }

    private fun upload(server: String, jpeg: ByteArray) {
        Thread {
            val result = try {
                Result.success(AnalyzeClient.analyze(server, DriverPrefs.contextJson(this), jpeg))
            } catch (error: AnalyzeException) {
                Result.failure(error)
            }
            main.post {
                busy = false
                result.fold(
                    onSuccess = { render(it) },
                    onFailure = { showMessage(it.message ?: "No se pudo analizar") },
                )
            }
        }.start()
    }

    private fun render(offers: List<OfferBits>) {
        val list = rows ?: return
        list.removeAllViews()
        if (offers.isEmpty()) {
            showMessage("No hay ofertas.")
            return
        }
        for (offer in offers) list.addView(offerRow(offer))
        fitScroll()
    }

    private fun offerRow(offer: OfferBits): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, px(2), 0, px(2))
        }
        row.addView(usuarioView(offer), LinearLayout.LayoutParams(0, px(44), 1.3f))
        row.addView(chip(R.drawable.ic_safety, OfferFormat.safetyColor(offer.safety), "Seguridad"), chipParams())
        row.addView(chip(R.drawable.ic_incline, OfferFormat.inclineColor(offer.incline), "Inclinación"), chipParams())
        val distance = OfferFormat.distance(offer)
        if (distance != null) {
            row.addView(distanceView(distance), LinearLayout.LayoutParams(0, px(40), 1.2f).apply { marginStart = px(4) })
        }
        return row
    }

    private fun usuarioView(offer: OfferBits): View {
        val usuario = OfferFormat.usuario(offer)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        box.addView(TextView(this).apply {
            text = usuario.text
            setTextColor(0xFF000000.toInt())
            textSize = 13f
            gravity = Gravity.CENTER
        })
        if (usuario.price != null) {
            box.addView(TextView(this).apply {
                text = usuario.price
                setTextColor(0xFF000000.toInt())
                textSize = 11f
                gravity = Gravity.CENTER
            })
        }
        return box
    }

    private fun distanceView(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setTextColor(0xFF1C1C1C.toInt())
            textSize = 11f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = px(10).toFloat()
                setColor(0x00000000)
                setStroke(px(1).coerceAtLeast(1), 0x66000000)
            }
            setPadding(px(4), 0, px(4), 0)
        }
    }

    private fun chip(icon: Int, color: Int, description: String): ImageView {
        return ImageView(this).apply {
            setImageResource(icon)
            contentDescription = description
            scaleType = ImageView.ScaleType.CENTER
            background = GradientDrawable().apply {
                cornerRadius = px(10).toFloat()
                setColor(color)
            }
            setPadding(px(6), px(6), px(6), px(6))
        }
    }

    private fun chipParams(): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(px(40), px(40)).apply { marginStart = px(4) }
    }

    private fun action(icon: Int, description: String, onClick: () -> Unit): ImageView {
        return ImageView(this).apply {
            setImageResource(icon)
            contentDescription = description
            scaleType = ImageView.ScaleType.CENTER
            layoutParams = LinearLayout.LayoutParams(px(36), px(36))
            setOnClickListener { onClick() }
        }
    }

    private fun showMessage(text: String) {
        val list = rows ?: return
        list.removeAllViews()
        list.addView(TextView(this).apply {
            this.text = text
            setTextColor(0xFF000000.toInt())
            textSize = 13f
            setPadding(px(8), px(8), px(8), px(8))
        })
        fitScroll()
    }

    private fun fitScroll() {
        val scroller = scroll ?: return
        val count = rows?.childCount ?: 0
        val params = scroller.layoutParams
        params.height = if (count > 3) px(52) * 3 else LinearLayout.LayoutParams.WRAP_CONTENT
        scroller.layoutParams = params
    }

    private fun openCaptureSettings() {
        showMessage("Activa Asistente driver en Accesibilidad")
        try {
            startActivity(ShotService.settings(this))
        } catch (_: Exception) {
        }
    }

    private fun openFull() {
        startActivity(
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
        )
    }

    private fun drag(event: MotionEvent): Boolean {
        val params = layoutParams ?: return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                startX = params.x
                startY = params.y
            }
            MotionEvent.ACTION_MOVE -> {
                placeRight(params)
                params.y = (startY + (event.rawY - downY).toInt()).coerceIn(0, maxFloatY())
                if (attached && panel != null) windowManager.updateViewLayout(panel, params)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> DriverPrefs.saveFloatY(this, params.y)
        }
        return true
    }

    private fun moveTo(y: Int) {
        val params = layoutParams ?: return
        placeRight(params)
        params.y = y.coerceIn(0, maxFloatY())
        val view = panel ?: return
        view.visibility = View.VISIBLE
        if (attached) windowManager.updateViewLayout(view, params)
    }

    private fun placeRight(params: WindowManager.LayoutParams) {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        params.x = (metrics.widthPixels - params.width - px(6)).coerceAtLeast(0)
    }

    private fun savedFloatY(): Int {
        val saved = DriverPrefs.floatY(this)
        return if (saved < 0) px(48) else saved.coerceIn(0, maxFloatY())
    }

    private fun maxFloatY(): Int {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        return (metrics.heightPixels - px(80)).coerceAtLeast(px(48))
    }

    private fun detach() {
        val view = panel ?: return
        if (!attached) return
        windowManager.removeView(view)
        attached = false
    }

    private fun attach() {
        val view = panel ?: return
        val params = layoutParams ?: return
        if (attached) {
            view.visibility = View.VISIBLE
            return
        }
        windowManager.addView(view, params)
        attached = true
        view.visibility = View.VISIBLE
    }

    private fun plate(): GradientDrawable {
        return GradientDrawable().apply {
            cornerRadius = px(14).toFloat()
            setColor(0xF5FFFFFF.toInt())
        }
    }

    private fun space(height: Int): View {
        return View(this).apply { layoutParams = LinearLayout.LayoutParams(1, height) }
    }

    private fun px(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun notification(): Notification {
        val channelId = "franja"
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(channelId) == null) {
            val channel = NotificationChannel(channelId, "Franja", NotificationManager.IMPORTANCE_LOW)
            channel.setSound(null, null)
            manager.createNotificationChannel(channel)
        }
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("Asistente driver")
            .setContentText("Franja activa")
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun jpegFromBitmap(source: Bitmap): ByteArray {
        val longSide = maxOf(source.width, source.height)
        val scaled = if (longSide <= 1600) {
            source
        } else {
            val ratio = 1600f / longSide
            Bitmap.createScaledBitmap(source, (source.width * ratio).toInt(), (source.height * ratio).toInt(), true)
        }
        val out = java.io.ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        if (scaled !== source) scaled.recycle()
        source.recycle()
        return out.toByteArray()
    }

    private fun jpegFrom(image: Image): ByteArray {
        val plane = image.planes[0]
        val width = image.width
        val height = image.height
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val buffer = plane.buffer
        buffer.rewind()
        val padded = width + (rowStride - pixelStride * width) / pixelStride
        val bitmap = Bitmap.createBitmap(padded, height, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(buffer)
        val cropped = if (padded == width) bitmap else Bitmap.createBitmap(bitmap, 0, 0, width, height)
        val longSide = maxOf(cropped.width, cropped.height)
        val scaled = if (longSide <= 1600) {
            cropped
        } else {
            val ratio = 1600f / longSide
            Bitmap.createScaledBitmap(cropped, (cropped.width * ratio).toInt(), (cropped.height * ratio).toInt(), true)
        }
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, out)
        if (scaled !== cropped) scaled.recycle()
        if (cropped !== bitmap) cropped.recycle()
        bitmap.recycle()
        return out.toByteArray()
    }

    private fun parcelableIntent(intent: Intent): Intent? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_DATA)
        }
    }

    companion object {
        const val ACTION_START = "app.driverhappy.START"
        const val ACTION_FLOAT = "app.driverhappy.FLOAT"
        const val ACTION_ARM = "app.driverhappy.ARM"
        const val ACTION_SHOT = "app.driverhappy.SHOT"
        const val ACTION_CANCEL = "app.driverhappy.CANCEL"
        const val ACTION_SHOW = "app.driverhappy.SHOW"
        const val ACTION_HIDE = "app.driverhappy.HIDE"
        const val ACTION_MOVE = "app.driverhappy.MOVE"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        const val EXTRA_Y = "y"
        const val EXTRA_SHOOT = "shoot"

        @Volatile
        var running = false

        @Volatile
        var sharing = false

        fun show(context: Context) {
            if (!running) return
            context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_SHOW))
        }

        fun hide(context: Context) {
            if (!running) return
            context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_HIDE))
        }

        fun moveVertical(context: Context, y: Int) {
            val intent = Intent(context, OverlayService::class.java).setAction(ACTION_MOVE).putExtra(EXTRA_Y, y)
            if (running) context.startService(intent) else context.startForegroundService(intent)
        }
    }
}
