package app.driverhappy

import android.content.Context

object DriverPrefs {
    private const val file = "driver"
    private const val fallback =
        """{"mode":"saliendo","home":"","contiguousZones":["Itagüí","Sabaneta","Poblado","Laureles","Belén","Envigado"],"distantZones":[],"compacto":false}"""

    private fun prefs(context: Context) = context.getSharedPreferences(file, Context.MODE_PRIVATE)

    const val defaultServer = "http://192.168.1.15:3000"

    fun server(context: Context): String {
        val saved = prefs(context).getString("server", "") ?: ""
        return saved.ifBlank { defaultServer }
    }

    fun saveServer(context: Context, url: String) {
        prefs(context).edit().putString("server", url).apply()
    }

    fun contextJson(context: Context): String = prefs(context).getString("context", fallback) ?: fallback

    fun saveContext(context: Context, json: String) {
        if (json.isBlank()) return
        prefs(context).edit().putString("context", json).apply()
    }

    fun floatY(context: Context): Int = prefs(context).getInt("float_y", -1)

    fun saveFloatY(context: Context, y: Int) {
        prefs(context).edit().putInt("float_y", y).apply()
    }
}
