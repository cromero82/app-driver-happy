package app.driverhappy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfferFormatTest {
    @Test
    fun nombreYPrecio() {
        val usuario = OfferFormat.usuario(bits(name = "Solecito", price = 33300))
        assertEquals("Solecito", usuario.text)
        assertTrue(usuario.price!!.contains("33.300"))
    }

    @Test
    fun soloPrecio() {
        val usuario = OfferFormat.usuario(bits(name = null, price = 23300))
        assertTrue(usuario.text.contains("23.300"))
        assertNull(usuario.price)
    }

    @Test
    fun didiMinutosYKm() {
        val text = OfferFormat.distance(
            bits(app = "didi", pickupMin = 7, pickupKm = 1.1, tripMin = 32, tripKm = 9.8),
        )
        assertEquals("7 min (1,1 km) · 32 min (9,8 km)", text)
    }

    @Test
    fun indriveConTilde() {
        val text = OfferFormat.distance(bits(app = "indrive", pickupKm = 3.3, offerAge = "2 min."))
        assertEquals("2 min (~3,3 km)", text)
    }

    @Test
    fun sinDistanciaNoCalcula() {
        assertNull(OfferFormat.distance(bits(tripKm = 9.8, tripKmFromRoute = true)))
    }

    @Test
    fun colores() {
        assertEquals(0xFFD9F5E5.toInt(), OfferFormat.safetyColor("verde"))
        assertEquals(0xFFF8C9C4.toInt(), OfferFormat.inclineColor("muy_alta"))
        assertEquals(0xFFECECEF.toInt(), OfferFormat.safetyColor(null))
    }

    @Test
    fun direccionDelMac() {
        assertEquals("http://192.168.1.8:3000", normalizeServer("192.168.1.8:3000/"))
        assertEquals("", normalizeServer("  "))
        assertEquals("http://192.168.1.15:3000", DriverPrefs.defaultServer)
    }

    private fun bits(
        name: String? = null,
        price: Int = 0,
        app: String = "indrive",
        pickupKm: Double? = null,
        tripKm: Double? = null,
        tripKmFromRoute: Boolean = false,
        pickupMin: Int? = null,
        tripMin: Int? = null,
        offerAge: String? = null,
    ) = OfferBits(name, price, app, pickupKm, tripKm, tripKmFromRoute, pickupMin, tripMin, offerAge, "verde", "plana")
}
