package com.aiko.onmyoji.engine

import androidx.compose.ui.graphics.Color

object PixelArtAssets {
    // 8x8 pixel art sprites
    val playerSprite = listOf(
        "....BB....",
        "...BIIB...",
        "..BIIIIB..",
        ".BWWIIWWB.",
        ".BIIIIIIB.",
        "..BIIIIB..",
        "...BIIB...",
        "....BB...."
    )

    val aikoSprite = listOf(
        "..B....B..",
        ".BPB..BPB.",
        ".BPPBBPPB.",
        "BWWPPWWB.",
        "BPPPPPPB.",
        ".BPPPPB.",
        "..BPPB..",
        "...BB..."
    )

    val npcSprite = listOf(
        "....BB....",
        "...BYYB...",
        "..BWWWWB..",
        ".BYYYYYYB.",
        ".BYBBYBY.",
        "..BYYYYB..",
        "...BYYB...",
        "....BB...."
    )

    val spiritSprite = listOf(
        "....BB....",
        "...BMMB...",
        "..BMMMMB..",
        ".BWWMMWWB.",
        ".BMMMMMMB.",
        "..BMMMMB..",
        "...BMMB...",
        "....BB...."
    )

    fun getColorForChar(c: Char): Color? {
        return when (c) {
            'B' -> Color(0xFF111111) // Outline
            'I' -> Color(0xFF3F51B5) // Onmyoji Indigo
            'W' -> Color(0xFFFFFFFF) // White
            'P' -> Color(0xFFFF80AB) // Aiko Pink
            'Y' -> Color(0xFFFFD54F) // Samurai Yellow
            'M' -> Color(0xFFB06AB3) // Spirit Purple
            else -> null // Transparent
        }
    }
}
