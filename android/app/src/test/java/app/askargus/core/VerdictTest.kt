package app.askargus.core

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class VerdictTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val sample = """
        {"kind":"url","subject":"http://paypal-security-alert.net/verify","score":96,"level":"HIGH RISK",
         "threat_type":"Phishing","recommendation":"High risk.","scanned_at":"2026-09-30T10:00:00Z","verified":false,
         "signals":[
          {"source":"Heuristics","status":"suspicious","score":60,"weight":1.0,"summary":"Mentions PayPal","authoritative":false,"evidence":{"x":1}},
          {"source":"Phishing.Database","status":"malicious","score":95,"weight":1.5,"summary":"Listed as phishing","authoritative":true,"evidence":{}},
          {"source":"VirusTotal","status":"unavailable","score":0,"weight":0,"summary":"Not configured","authoritative":false,"evidence":{}},
          {"source":"Site reputation","status":"clean","score":0,"weight":0.5,"summary":"Unknown site","authoritative":false,"evidence":{}}
         ]}
    """.trimIndent()

    @Test fun readsTheEnginesVerdict() {
        val v = json.decodeFromString(Verdict.serializer(), sample)
        assertEquals(96, v.score)
        assertEquals("Phishing", v.threatType)
        assertEquals(4, v.signals.size)
    }

    @Test fun reasonsAreTheFlaggedSignalsStrongestFirst() {
        val v = json.decodeFromString(Verdict.serializer(), sample)
        assertEquals(listOf("Listed as phishing", "Mentions PayPal"), Reasons.top(v))
        assertEquals(3 to 4, Reasons.answered(v))
        assertEquals("Phishing", Reasons.subtitle(v))
    }

    @Test fun subtitleForCleanVerdicts() {
        val clean = Verdict("text", "hi", 0, "SAFE", "None", emptyList(), "", "", verified = false)
        assertEquals("Nothing suspicious found", Reasons.subtitle(clean))
        assertEquals("Positive evidence it's legitimate", Reasons.subtitle(clean.copy(verified = true)))
    }
}
