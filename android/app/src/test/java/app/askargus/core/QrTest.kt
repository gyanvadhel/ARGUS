package app.askargus.core

import org.junit.Assert.assertEquals
import org.junit.Test

class QrTest {
    @Test fun readsAUpiPaymentCode() {
        assertEquals(
            QrPayload.Upi(false, "refund.desk@ybl", "KBC Prize Team", "4999.00", "Claim your prize"),
            Qr.parse("upi://pay?pa=refund.desk@ybl&pn=KBC%20Prize%20Team&am=4999.00&cu=INR&tn=Claim%20your%20prize"),
        )
    }

    @Test fun spotsAutopayMandates() {
        assertEquals(QrPayload.Upi(true, "shop@okaxis", "Shop", "999", null), Qr.parse("UPI://MANDATE?pa=shop@okaxis&pn=Shop&am=999"))
    }

    @Test fun leavesOutWhatAUpiCodeDoesNotSay() {
        assertEquals(QrPayload.Upi(false, "chai.stall@paytm", null, null, null), Qr.parse("upi://pay?pa=chai.stall@paytm"))
    }

    @Test fun upiWithoutPayeeIsPlainText() {
        assertEquals(QrPayload.Text("upi://pay?pn=Nobody"), Qr.parse("upi://pay?pn=Nobody"))
    }

    @Test fun linksGoToALinkCheck() {
        assertEquals(QrPayload.Url("https://paytm-kyc-update.example/login"), Qr.parse("https://paytm-kyc-update.example/login"))
        assertEquals(QrPayload.Url("https://www.example.com/offer"), Qr.parse("  www.example.com/offer "))
    }

    @Test fun numbersAndTexts() {
        assertEquals(QrPayload.Phone("+919876543210"), Qr.parse("tel:+919876543210"))
        assertEquals(
            QrPayload.Text("Your KYC expires today, call now\n+919876543210"),
            Qr.parse("SMSTO:+919876543210:Your KYC expires today, call now"),
        )
        assertEquals(QrPayload.Text("Table 4, ask for the menu"), Qr.parse("Table 4, ask for the menu"))
    }

    @Test fun malformedPercentSignsDoNotCrash() {
        assertEquals(QrPayload.Upi(false, "a@b", "100%", null, null), Qr.parse("upi://pay?pa=a@b&pn=100%"))
    }
}
