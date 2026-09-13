package com.aiko.onmyoji.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = OnmyojiIndigo,
    onPrimary = Color.White,
    secondary = ShoujoPink,
    background = OnmyojiPaper,
    onBackground = ShoujoText,
    surface = Color.White,
    onSurface = ShoujoText,
    surfaceVariant = ShoujoPalePink,
)

private val DarkColors = darkColorScheme(
    primary = ShoujoPink,
    onPrimary = Color.White,
    secondary = OnmyojiIndigo,
    background = OnmyojiNight,
    onBackground = ShoujoDarkText,
    surface = ShoujoDarkSurface,
    onSurface = ShoujoDarkText,
    surfaceVariant = ShoujoDarkPalePink,
)

@Composable
fun AikoOnmyojiTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
