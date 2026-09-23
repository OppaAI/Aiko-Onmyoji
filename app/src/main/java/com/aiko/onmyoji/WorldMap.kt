package com.aiko.onmyoji

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiko.onmyoji.data.model.Entity
import com.aiko.onmyoji.data.model.JourneyState
import com.aiko.onmyoji.engine.BattleScreen
import com.aiko.onmyoji.engine.GameMaps
import com.aiko.onmyoji.engine.SpriteLibrary
import com.aiko.onmyoji.engine.WorldViewport
import com.aiko.onmyoji.ui.theme.OnmyojiIndigo
import com.aiko.onmyoji.ui.theme.ShoujoText
import kotlin.math.abs

// Tile legend: '.' ground, ',' road, '~' water, 'H' house, 'S' shrine,
// 'C' chapel, 'T' tree, 'P' plaza. Everything except water/houses walks.
private val SAKAI_MAP = listOf(
    "TTTT....HHHH....",
    "TT......HHHH..S.",
    "..........,,....",
    ".....HHHH,,.....",
    "..P...,,,,,..C..",
    ".....HHHH,,.....",
    ".....HHHH,,..T..",
    "..H...,,,,...H..",
    "..H...,,.....H..",
    "......,,....H...",
    "~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~",
)

private val GENERIC_MAP = listOf(
    "TTT.....HHHH....",
    "TT......HHHH....",
    "..........,,....",
    ".....HHHH,,..S..",
    "..P...,,,,......",
    ".....HHHH,,.....",
    ".....HHHH,,..T..",
    "..H...,,,,...H..",
    "..H...,,.....H..",
    "......,,....H...",
    "TTTT..........TT",
    "TTTT..........TT",
)

private val BLOCKED = setOf('~', 'H')

private fun tilesFor(location: String): List<String> =
    if (location.lowercase().contains("sakai")) SAKAI_MAP else GENERIC_MAP

private data class Marker(val id: String, val label: String, val col: Long, val tx: Int, val ty: Int)

private fun markerTile(entityId: String, index: Int, tiles: List<String>): Pair<Int, Int> {
    val free = ArrayList<Pair<Int, Int>>()
    tiles.forEachIndexed { y, row ->
        row.forEachIndexed { x, c ->
            if (c !in BLOCKED) free.add(x to y)
        }
    }
    if (free.isEmpty()) return 0 to 0
    val h = (entityId.hashCode() and 0x7fffffff) + index * 7
    return free[h % free.size]
}

/** Walkable town view: player + trailing Aiko + NPC markers, D-pad movement. */
@Composable
fun ExploreScreen(
    journey: JourneyState?,
    onTalk: (String, String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (journey == null) return
    
    // Grid movement state
    var px by remember(journey.location) { mutableStateOf(5f) }
    var py by remember(journey.location) { mutableStateOf(4f) }
    var ax by remember(journey.location) { mutableStateOf(5f) }
    var ay by remember(journey.location) { mutableStateOf(5f) }

    val enrichedEntities = remember(journey.entities, journey.location) {
        SpriteLibrary.enrichEntities(journey.entities, journey.location)
    }
    
    var activeConversationPartner by remember { mutableStateOf<Entity?>(null) }
    var activeCombatSpirit by remember { mutableStateOf<Entity?>(null) }
    var talkText by remember { mutableStateOf("") }

    Column(modifier = modifier.fillMaxSize().padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("‹ Back") }
            Spacer(Modifier.width(8.dp))
            Text(
                "🚶 ${journey.location} · ${journey.date}",
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
            )
        }
        
        Spacer(Modifier.height(8.dp))

        if (activeCombatSpirit != null) {
            BattleScreen(
                spirit = activeCombatSpirit!!,
                journey = journey,
                onCast = { _ -> }, // Backend sync could be added here
                onFlee = { activeCombatSpirit = null }
            )
        } else {
            // Render 2D Top-Down Viewport map from the engine
            WorldViewport(
                mapGrid = GameMaps.kyotoMap,
                playerX = px,
                playerY = py,
                aikoX = ax,
                aikoY = ay,
                entities = enrichedEntities,
                onMove = { dx, dy ->
                    val nx = (px + dx).coerceIn(0f, 15f)
                    val ny = (py + dy).coerceIn(0f, 15f)
                    
                    // Simple path boundary checking against wall tiles
                    val tileType = GameMaps.kyotoMap.getOrNull(ny.toInt())?.getOrNull(nx.toInt()) ?: 0
                    if (tileType != 1) {
                        ax = px
                        ay = py
                        px = nx
                        py = ny
                        
                        // Check if stepped into a spirit coordinate to trigger combat
                        val encounteredSpirit = enrichedEntities.firstOrNull { 
                            it.kind == "spirit" && it.id != "aiko" && abs(it.x - px) < 0.8f && abs(it.y - py) < 0.8f
                        }
                        if (encounteredSpirit != null) {
                            activeCombatSpirit = encounteredSpirit
                        }
                    }
                },
                onInteract = { partner ->
                    activeConversationPartner = partner
                }
            )

            Spacer(Modifier.height(12.dp))

            // Proximity Conversation panel
            if (activeConversationPartner != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.9f))
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            "💬 To ${activeConversationPartner!!.name}:",
                            fontWeight = FontWeight.Bold,
                            color = OnmyojiIndigo,
                            fontSize = 14.sp
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = talkText,
                                onValueChange = { talkText = it },
                                placeholder = { Text("Speak with care...", fontSize = 12.sp) },
                                modifier = Modifier.weight(1f),
                                maxLines = 2,
                                shape = RoundedCornerShape(8.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Button(
                                onClick = {
                                    if (talkText.isNotBlank()) {
                                        onTalk(activeConversationPartner!!.id, talkText.trim())
                                        talkText = ""
                                        activeConversationPartner = null
                                    }
                                }
                            ) {
                                Text("Speak")
                            }
                        }
                    }
                }
            } else {
                // Recent dialogue tail overlay
                val history = journey.dialogue.takeLast(2)
                if (history.isNotEmpty()) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                        history.forEach { line ->
                            Text(
                                "${line.who}: ${line.text.take(80)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = ShoujoText.copy(alpha = 0.8f),
                                modifier = Modifier.padding(vertical = 1.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

