package app.askargus.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.askargus.R

// Archivo's width axis condenses the display type, as on the website.
@OptIn(ExperimentalTextApi::class)
private fun archivo(weight: Int, width: Float) = Font(
    R.font.archivo,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)),
)

val DisplayFamily = FontFamily(archivo(800, 72f))
val BodyFamily = FontFamily(archivo(400, 100f), archivo(500, 100f), archivo(600, 100f))

val ArgusTypography = Typography(
    displayLarge = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 56.sp, lineHeight = 56.sp),
    displayMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 44.sp, lineHeight = 46.sp),
    headlineMedium = TextStyle(fontFamily = DisplayFamily, fontWeight = FontWeight(800), fontSize = 32.sp, lineHeight = 34.sp),
    titleLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 20.sp, lineHeight = 26.sp),
    titleMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 17.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(400), fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(400), fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(600), fontSize = 15.sp),
    labelMedium = TextStyle(fontFamily = BodyFamily, fontWeight = FontWeight(500), fontSize = 12.sp),
)
