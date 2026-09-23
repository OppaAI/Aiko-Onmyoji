package com.aiko.onmyoji.engine

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiko.onmyoji.data.model.Entity
import com.aiko.onmyoji.data.model.JourneyState
import com.aiko.onmyoji.ui.theme.OnmyojiIndigo
import com.aiko.onmyoji.ui.theme.PastelBlue
import com.aiko.onmyoji.ui.theme.ShoujoPink
import com.aiko.onmyoji.ui.theme.ShoujoText

@Composable
fun BattleScreen(
    spirit: Entity,
    journey: JourneyState,
    onCast: (ritualName: String) -> Unit,
    onFlee: () -> Unit,
    modifier: Modifier = Modifier
) {
    var spiritHp by remember { mutableStateOf(spirit.dread * 15 + 10) }
    val maxSpiritHp = remember { spirit.dread * 15 + 10 }
    var battleLog by remember { mutableStateOf("An eerie mist rises! ${spirit.name} blocks your path.") }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xFF1C1C24), RoundedCornerShape(16.dp))
            .border(2.dp, Color(0xFFE74C3C), RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Battle Header
        Text(
            "⚔️ SPIRIT CONFLICT ⚔️",
            color = Color(0xFFE74C3C),
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp
        )
        Spacer(modifier = Modifier.height(12.dp))

        // Enemy info
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(spirit.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text("Dread Level: ${spirit.dread}", color = Color.LightGray, fontSize = 12.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("Spirit HP: $spiritHp / $maxSpiritHp", color = Color(0xFFE74C3C), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                LinearProgressIndicator(
                    progress = { if (maxSpiritHp <= 0) 0f else spiritHp.toFloat() / maxSpiritHp },
                    modifier = Modifier.width(100.dp).height(6.dp),
                    color = Color(0xFFE74C3C),
                    trackColor = Color.Gray
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Battle log message box
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.Black.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth().height(60.dp)
        ) {
            Box(Modifier.fillMaxSize().padding(8.dp), contentAlignment = Alignment.Center) {
                Text(
                    battleLog,
                    color = Color(0xFFFFE9B0),
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (spiritHp <= 0) {
            Text("✨ Spirit Purified! ✨", color = Color(0xFF2ECC71), fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onFlee,
                colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo)
            ) {
                Text("Return to Map")
            }
        } else {
            // Battle Actions Grid
            Text("Select Onmyodo Rite:", color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.Start))
            Spacer(modifier = Modifier.height(6.dp))
            
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = {
                            if (journey.mp >= 2) {
                                spiritHp = (spiritHp - 8).coerceAtLeast(0)
                                battleLog = "You cast Bind! The spirit writhes under the sacred seal."
                                onCast("bind")
                            } else {
                                battleLog = "Not enough MP for Bind rite!"
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2980B9)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Bind (2⚡)", fontSize = 12.sp)
                    }
                    Button(
                        onClick = {
                            if (journey.mp >= 2) {
                                spiritHp = (spiritHp - 12).coerceAtLeast(0)
                                battleLog = "You cast Purify! Radiant spiritual flames consume the dread."
                                onCast("purify")
                            } else {
                                battleLog = "Not enough MP for Purify rite!"
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2ECC71)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Purify (2⚡)", fontSize = 12.sp)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Button(
                        onClick = {
                            if (journey.mp >= 3) {
                                spiritHp = (spiritHp - 20).coerceAtLeast(0)
                                battleLog = "You cast Banish! A violent talisman vortex tears at the ghost."
                                onCast("banish")
                            } else {
                                battleLog = "Not enough MP for Banish rite!"
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF9B59B6)),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Banish (3⚡)", fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = onFlee,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        modifier = Modifier.weight(1f),
                        border = BorderStroke(1.dp, Color.Gray)
                    ) {
                        Text("Flee", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
