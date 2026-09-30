package app.askargus.read

import android.content.Context
import android.net.Uri
import app.askargus.core.OcrText
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import kotlinx.coroutines.tasks.await

/** Reads QR codes and the words in screenshots on the phone (ML Kit, bundled models). Images never leave the phone.
 *  The Devanagari model reads Hindi and English text. */
class ImageReader(private val context: Context) {
    private val barcodes by lazy {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    private val recognizer by lazy { TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build()) }

    suspend fun qr(uri: Uri): String? =
        barcodes.process(InputImage.fromFilePath(context, uri)).await().firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }

    suspend fun words(uri: Uri): String = OcrText.tidy(recognizer.process(InputImage.fromFilePath(context, uri)).await().text)
}
