package com.aiko.onmyoji.engine

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiko.onmyoji.data.model.Entity
import com.aiko.onmyoji.ui.theme.OnmyojiIndigo
import com.aiko.onmyoji.ui.theme.ShoujoPink
import com.aiko.onmyoji.ui.theme.ShoujoText

object GameMaps {
    // 16x16 grid for simple, highly optimized top-down rendering
    val kyotoMap = arrayOf(
        intArrayOf(1,1,1,1,1,1,1,5,1,1,1,1,1,1,1,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,0,4,4,4,0,0,2,0,0,4,4,4,0,0,1),
        intArrayOf(1,0,4,0,4,0,0,2,0,0,4,0,4,0,0,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,0,3,3,3,3,0,2,0,3,3,3,3,0,0,1),
        intArrayOf(5,2,2,2,2,2,2,2,2,2,2,2,2,2,2,5),
        intArrayOf(1,0,3,3,3,3,0,2,0,3,3,3,3,0,0,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,0,4,4,4,0,0,2,0,0,4,4,4,0,0,1),
        intArrayOf(1,0,4,0,4,0,0,2,0,0,4,0,4,0,0,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,0,0,0,0,0,0,2,0,0,0,0,0,0,0,1),
        intArrayOf(1,1,1,1,1,1,1,5,1,1,1,1,1,1,1,1)
    )
}

@Composable
fun WorldViewport(
    mapGrid: Array<IntArray>,
    playerX: Float,
    playerY: Float,
    aikoX: Float,
    aikoY: Float,
    entities: List<Entity>,
    onMove: (dx: Float, dy: Float) -> Unit,
    onInteract: (Entity) -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .background(Color(0xFF2C3E50))
            .border(2.dp, OnmyojiIndigo, RoundedCornerShape(12.dp))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val tileSize = size.width / 16f
            
            // Draw Tiles
            for (r in 0 until 16) {
                for (c in 0 until 16) {
                    val tileType = mapGrid.getOrNull(r)?.getOrNull(c) ?: 0
                    val tileColor = when (tileType) {
                        1 -> Color(0xFF27AE60) // Forest/Wall bounds
                        2 -> Color(0xFFBDC3C7) // Stone Paths
                        3 -> Color(0xFF2980B9) // Stream/Water
                        4 -> Color(0xFFD35400) // Buildings/Wooden floor
                        5 -> Color(0xFFE74C3C) // Torii Gates/Exits
                        else -> Color(0xFFEDF2F4) // Open Grass fields
                    }
                    drawRect(
                        color = tileColor,
                        topLeft = Offset(c * tileSize, r * tileSize),
                        size = Size(tileSize, tileSize)
                    )
                    // Simple grid overlay
                    drawRect(
                        color = Color.Black.copy(alpha = 0.05f),
                        topLeft = Offset(c * tileSize, r * tileSize),
                        size = Size(tileSize, tileSize),
                        style = Stroke(1f)
                    )
                }
            }

            // Helper function to render programmatic pixel art matrix grid
            fun drawPixelSprite(sprite: List<String>, tx: Float, ty: Float) {
                val pSize = tileSize / 10f
                sprite.forEachIndexed { rIndex, rowStr ->
                    rowStr.forEachIndexed { cIndex, char ->
                        val color = PixelArtAssets.getColorForChar(char)
                        if (color != null) {
                            drawRect(
                                color = color,
                                topLeft = Offset(tx * tileSize + cIndex * pSize, ty * tileSize + rIndex * pSize),
                                size = Size(pSize, pSize)
                            )
                        }
                    }
                }
            }

            // Draw Aiko (Trailing pixel art sprite companion)
            drawPixelSprite(PixelArtAssets.aikoSprite, aikoX, aikoY)

            // Draw NPCs and Spirits using pixel matrices
            entities.forEach { entity ->
                val sprite = if (entity.kind == "spirit") PixelArtAssets.spiritSprite else PixelArtAssets.npcSprite
                drawPixelSprite(sprite, entity.x, entity.y)
            }

            // Draw Player Character (Onmyoji Pixel Art)
            drawPixelSprite(PixelArtAssets.playerSprite, playerX, playerY)
        }

        // On-screen tactile controls row overlay at the bottom right corner
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(8.dp)
                .background(Color.White.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
                .padding(6.dp)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                IconButton(
                    onClick = { onMove(0f, -1f) },
                    modifier = Modifier.size(32.dp).background(OnmyojiIndigo, CircleShape)
                ) {
                    Icon(Icons.Default.ArrowDropUp, contentDescription = "Up", tint = Color.White)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    IconButton(
                        onClick = { onMove(-1f, 0f) },
                        modifier = Modifier.size(32.dp).background(OnmyojiIndigo, CircleShape)
                    ) {
                        Icon(Icons.Default.ArrowLeft, contentDescription = "Left", tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(24.dp))
                    IconButton(
                        onClick = { onMove(1f, 0f) },
                        modifier = Modifier.size(32.dp).background(OnmyojiIndigo, CircleShape)
                    ) {
                        Icon(Icons.Default.ArrowRight, contentDescription = "Right", tint = Color.White)
                    }
                }
                IconButton(
                    onClick = { onMove(0f, 1f) },
                    modifier = Modifier.size(32.dp).background(OnmyojiIndigo, CircleShape)
                ) {
                    Icon(Icons.Default.ArrowDropDown, contentDescription = "Down", tint = Color.White)
                }
            }
        }

        // Action / Interact overlay button if close to an entity
        val nearbyEntity = entities.firstOrNull { 
            Math.abs(it.x - playerX) <= 1.5f && Math.abs(it.y - playerY) <= 1.5f
        }
        if (nearbyEntity != null) {
            Button(
                onClick = { onInteract(nearbyEntity) },
                colors = ButtonDefaults.buttonColors(containerColor = ShoujoPink),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(12.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("💬 Greet ${nearbyEntity.name.ifBlank { nearbyEntity.id }}", color = ShoujoText, fontSize = 12.sp)
            }
        }
    }
}
