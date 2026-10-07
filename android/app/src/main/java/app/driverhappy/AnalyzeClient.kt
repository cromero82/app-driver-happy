package app.driverhappy

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AnalyzeException(message: String) : Exception(message)

object AnalyzeClient {
    fun analyze(server: String, contextJson: String, jpeg: ByteArray): List<OfferBits> {
        val base = server.trimEnd('/')
        if (base.isEmpty()) throw AnalyzeException("Falta la dirección del Mac")
        val ctx = JSONObject(contextJson)
        val body = JSONObject()
            .put("text", "")
            .put("ocr", "remoto")
            .put("compacto", ctx.optBoolean("compacto", false))
            .put("vista", "linea")
            .put(
                "context",
                JSONObject()
                    .put("mode", ctx.optString("mode", "saliendo"))
                    .put("home", ctx.optString("home", ""))
                    .put("contiguousZones", ctx.optJSONArray("contiguousZones") ?: JSONArray())
                    .put("distantZones", ctx.optJSONArray("distantZones") ?: JSONArray()),
            )
            .put(
                "image",
                JSONObject()
                    .put("mime", "image/jpeg")
                    .put("data", Base64.encodeToString(jpeg, Base64.NO_WRAP)),
            )
        val conn = (URL("$base/api/analyze").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("content-type", "application/json; charset=utf-8")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = JSONObject(text.ifBlank { "{}" })
            if (conn.responseCode !in 200..299) {
                throw AnalyzeException(json.optString("error").ifBlank { "No se pudo analizar" })
            }
            val offers = json.optJSONArray("offers") ?: JSONArray()
            return List(offers.length()) { bits(offers.getJSONObject(it)) }
        } catch (error: AnalyzeException) {
            throw error
        } catch (_: Exception) {
            throw AnalyzeException("El Mac no respondió. Revisa la dirección y la Wi-Fi.")
        } finally {
            conn.disconnect()
        }
    }

    private fun bits(row: JSONObject): OfferBits {
        val offer = row.optJSONObject("offer") ?: JSONObject()
        return OfferBits(
            passengerName = textOrNull(offer, "passengerName"),
            priceCop = offer.optInt("priceCop", 0),
            app = offer.optString("app", ""),
            pickupKm = doubleOrNull(offer, "pickupKm"),
            tripKm = doubleOrNull(offer, "tripKm"),
            tripKmFromRoute = offer.optBoolean("tripKmFromRoute", false),
            pickupMin = intOrNull(offer, "pickupMin"),
            tripMin = intOrNull(offer, "tripMin"),
            offerAge = textOrNull(offer, "offerAge"),
            safety = textOrNull(row, "safety"),
            incline = textOrNull(row, "incline"),
        )
    }

    private fun textOrNull(json: JSONObject, key: String): String? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optString(key).takeIf { it.isNotBlank() }
    }

    private fun doubleOrNull(json: JSONObject, key: String): Double? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optDouble(key)
    }

    private fun intOrNull(json: JSONObject, key: String): Int? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optInt(key)
    }
}
