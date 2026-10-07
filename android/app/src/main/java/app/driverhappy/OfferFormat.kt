package app.driverhappy

import java.text.NumberFormat
import java.util.Locale

data class OfferBits(
    val passengerName: String?,
    val priceCop: Int,
    val app: String,
    val pickupKm: Double?,
    val tripKm: Double?,
    val tripKmFromRoute: Boolean,
    val pickupMin: Int?,
    val tripMin: Int?,
    val offerAge: String?,
    val safety: String?,
    val incline: String?,
)

data class Usuario(val text: String, val price: String?)

object OfferFormat {
    private val money = NumberFormat.getCurrencyInstance(Locale("es", "CO")).apply {
        maximumFractionDigits = 0
    }
    private val km = NumberFormat.getNumberInstance(Locale("es", "CO")).apply {
        minimumFractionDigits = 1
        maximumFractionDigits = 1
    }

    fun usuario(offer: OfferBits): Usuario {
        val name = offer.passengerName?.trim().orEmpty()
        val price = if (offer.priceCop > 0) money.format(offer.priceCop) else ""
        return when {
            name.isNotEmpty() && price.isNotEmpty() -> Usuario(name, price)
            price.isNotEmpty() -> Usuario(price, null)
            name.isNotEmpty() -> Usuario(name, null)
            else -> Usuario("sin dato", null)
        }
    }

    fun distance(offer: OfferBits): String? = viaje(offer) ?: captureKm(offer)

    fun safetyColor(level: String?): Int = when (level) {
        "verde" -> 0xFFD9F5E5.toInt()
        "amarillo" -> 0xFFFFF3D6.toInt()
        "rojo" -> 0xFFFDE2E2.toInt()
        else -> 0xFFECECEF.toInt()
    }

    fun inclineColor(level: String?): Int = when (level) {
        "plana" -> 0xFFE5F7F4.toInt()
        "media" -> 0xFFE7F0FB.toInt()
        "alta" -> 0xFFFFE8D6.toInt()
        "muy_alta" -> 0xFFF8C9C4.toInt()
        else -> 0xFFECECEF.toInt()
    }

    private fun viaje(offer: OfferBits): String? {
        val age = offer.offerAge?.takeIf { it.contains("min", ignoreCase = true) }?.removeSuffix(".")
        val pickupMin = when {
            offer.pickupMin != null -> "${offer.pickupMin} min"
            offer.tripMin == null -> age
            else -> null
        }
        val pickup = leg(pickupMin, offer.pickupKm, offer.app == "indrive")
        val trip = if (offer.tripKmFromRoute) null else leg(offer.tripMin?.let { "$it min" }, offer.tripKm, false)
        if (trip != null) return if (pickup != null) "$pickup · $trip" else trip
        return pickup
    }

    private fun captureKm(offer: OfferBits): String? {
        val pickup = offer.pickupKm?.let { kmBit(it, true) }
        val trip = if (offer.tripKm != null && !offer.tripKmFromRoute) kmBit(offer.tripKm, false) else null
        if (trip != null && pickup != null) return "$trip / $pickup"
        return pickup ?: trip
    }

    private fun leg(min: String?, km: Double?, approx: Boolean): String? {
        val kmText = km?.let { kmBit(it, approx) }
        val minText = min?.takeIf { it.isNotBlank() }
        if (minText != null && kmText != null) return "$minText ($kmText)"
        return kmText ?: minText
    }

    private fun kmBit(value: Double, approx: Boolean): String {
        return (if (approx) "~" else "") + km.format(value) + " km"
    }
}

fun normalizeServer(raw: String): String {
    var value = raw.trim().trimEnd('/')
    if (value.isEmpty()) return ""
    if (!value.startsWith("http://") && !value.startsWith("https://")) value = "http://$value"
    return value
}
