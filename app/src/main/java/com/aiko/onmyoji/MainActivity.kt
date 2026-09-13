package com.aiko.onmyoji

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aiko.onmyoji.data.ServerConfig
import com.aiko.onmyoji.data.model.ActRequest
import com.aiko.onmyoji.data.model.JourneyState
import com.aiko.onmyoji.data.model.StartRequest
import com.aiko.onmyoji.data.model.TalkRequest
import com.aiko.onmyoji.data.remote.OnmyojiApi
import com.aiko.onmyoji.ui.theme.AikoOnmyojiTheme
import com.aiko.onmyoji.ui.theme.OnmyojiIndigo
import com.aiko.onmyoji.ui.theme.PastelBlue
import com.aiko.onmyoji.ui.theme.PastelPurple
import com.aiko.onmyoji.ui.theme.ShoujoPink
import com.aiko.onmyoji.ui.theme.ShoujoText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

enum class Screen { Title, Journey }

// Mirror of server RITUAL_MP (display only; server enforces).
private val RITUAL_MP = mapOf("ward" to 1, "bind" to 2, "purify" to 2, "banish" to 3)

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AikoOnmyojiTheme {
                // Baked in at build time from AIKO_PUBLIC_BASE_URL
                // (see local.properties → BuildConfig). No in-app override.
                val baseUrl = remember { ServerConfig.get() }
                val api = remember(baseUrl) { buildApi(baseUrl) }
                Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
                    OnmyojiApp(api = api, baseUrl = baseUrl, modifier = Modifier.padding(padding))
                }
            }
        }
    }

    private fun buildApi(baseUrl: String): OnmyojiApi {
        val json = Json { ignoreUnknownKeys = true; isLenient = true }
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(OnmyojiApi::class.java)
    }
}

@Composable
fun OnmyojiApp(api: OnmyojiApi, baseUrl: String, modifier: Modifier = Modifier) {
    var screen by remember { mutableStateOf(Screen.Title) }
    var journey by remember { mutableStateOf<JourneyState?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var backendOk by remember { mutableStateOf<Boolean?>(null) }
    var events by remember { mutableStateOf(listOf<String>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(baseUrl) {
        backendOk = try {
            withContext(Dispatchers.IO) { api.health() }.ok
        } catch (_: Exception) {
            false
        }
    }

    suspend fun refresh(): Boolean {
        return try {
            journey = withContext(Dispatchers.IO) { api.state() }
            error = null
            true
        } catch (e: Exception) {
            error = e.message ?: "Could not reach the server."
            false
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(OnmyojiIndigo.copy(alpha = 0.08f))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Aiko Onmyoji ♡⛩️",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.ExtraBold,
            color = OnmyojiIndigo,
        )
        Text(
            "Sengoku · ${ServerConfig.displayHost(baseUrl)}" +
                when (backendOk) {
                    true -> " · ✅"
                    false -> " · offline"
                    null -> ""
                },
            style = MaterialTheme.typography.bodySmall,
            color = ShoujoText.copy(alpha = 0.7f),
        )
        Spacer(modifier = Modifier.height(8.dp))

        when (screen) {
            Screen.Title -> TitleScreen(
                loading = loading,
                onNewJourney = {
                    scope.launch {
                        loading = true
                        error = null
                        events = emptyList()
                        try {
                            journey = withContext(Dispatchers.IO) { api.start(StartRequest()) }
                            screen = Screen.Journey
                        } catch (e: Exception) {
                            error = e.message ?: "Could not start the journey."
                        }
                        loading = false
                    }
                },
            )
            Screen.Journey -> JourneyScreen(
                api = api,
                journey = journey,
                loading = loading,
                events = events,
                onRefresh = {
                    scope.launch {
                        loading = true
                        refresh()
                        loading = false
                    }
                },
                onAct = { req ->
                    scope.launch {
                        loading = true
                        try {
                            val res = withContext(Dispatchers.IO) { api.act(req) }
                            journey = res.journey
                            events = res.events
                            error = null
                        } catch (e: Exception) {
                            error = e.message ?: "Action failed."
                        }
                        loading = false
                    }
                },
                onTalk = { target, message ->
                    scope.launch {
                        loading = true
                        try {
                            val res = withContext(Dispatchers.IO) {
                                api.talk(TalkRequest(target = target, message = message))
                            }
                            journey = res.journey
                            error = null
                        } catch (e: Exception) {
                            error = e.message ?: "Talk failed."
                        }
                        loading = false
                    }
                },
                onBack = { screen = Screen.Title },
            )
        }

        error?.let { msg ->
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(msg, color = Color(0xFFC62828), textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { error = null }) { Text("Dismiss") }
                }
            }
        }
    }
}

@Composable
private fun TitleScreen(loading: Boolean, onNewJourney: () -> Unit) {
    val scroll = rememberScrollState()
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().verticalScroll(scroll),
    ) {
        Spacer(modifier = Modifier.height(24.dp))
        Text("⛩️", fontSize = 64.sp)
        Text(
            "An onmyoji and his shikigami walk Sengoku Japan.",
            style = MaterialTheme.typography.bodyMedium,
            color = ShoujoText,
            textAlign = TextAlign.Center,
        )
        Text(
            "Kyoto, eve of Honnō-ji — June 1582.",
            style = MaterialTheme.typography.bodySmall,
            color = ShoujoText.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(12.dp))
        if (loading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text("Summoning Aiko… 🐱", color = ShoujoText)
            }
        } else {
            Button(
                onClick = onNewJourney,
                modifier = Modifier.fillMaxWidth(0.9f),
                colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
            ) { Text("Begin the journey ⛩️") }
        }
        Text(
            "Narrator + Aiko voices arrive in Phase 0+ — this build carries your journey state.",
            style = MaterialTheme.typography.bodySmall,
            color = ShoujoText.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun JourneyScreen(
    api: OnmyojiApi,
    journey: JourneyState?,
    loading: Boolean,
    events: List<String>,
    onRefresh: () -> Unit,
    onAct: (ActRequest) -> Unit,
    onTalk: (String, String) -> Unit,
    onBack: () -> Unit,
) {
    val scroll = rememberScrollState()
    var showTravel by remember { mutableStateOf(false) }
    var showRitual by remember { mutableStateOf(false) }
    var showTalk by remember { mutableStateOf(false) }
    var showTrain by remember { mutableStateOf(false) }
    var destinations by remember { mutableStateOf(listOf<String>()) }
    var rituals by remember { mutableStateOf(listOf("ward", "bind", "purify", "banish")) }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().verticalScroll(scroll),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("← Title") }
            Spacer(modifier = Modifier.weight(1f))
            Text("📜 Journey", fontWeight = FontWeight.ExtraBold, color = OnmyojiIndigo)
            Spacer(modifier = Modifier.weight(1f))
            Spacer(modifier = Modifier.width(64.dp))
        }

        if (journey == null) {
            Text("No journey loaded.", color = ShoujoText)
            return@Column
        }

        LaunchedEffect(journey.location) {
            try {
                val opts = withContext(Dispatchers.IO) { api.options() }
                if (opts.destinations.isNotEmpty()) destinations = opts.destinations
                if (opts.rituals.isNotEmpty()) rituals = opts.rituals
            } catch (_: Exception) {
                if (destinations.isEmpty()) {
                    destinations = listOf("Kyoto", "Azuchi", "Osaka", "Sakai", "Kiyosu", "Odawara")
                        .filter { it != journey.location }
                }
            }
        }

        if (events.isNotEmpty()) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = PastelPurple),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    events.forEach {
                        Text(it, color = ShoujoText, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        StateCard(title = "📍 Where & when") {
            Text("🗓️ ${journey.date} · ⛩️ ${journey.location}", color = ShoujoText,
                style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        }

        StateCard(title = "❤️ Status") {
            VitalBar(label = "Vitality", value = journey.hp, max = journey.max_hp, color = Color(0xFFE57373))
            Spacer(modifier = Modifier.height(4.dp))
            VitalBar(label = "Spirit", value = journey.mp, max = journey.max_mp, color = PastelBlue)
            Spacer(modifier = Modifier.height(4.dp))
            Text("😇 Moral: ${moralRank(journey.morality)} (${journey.morality})",
                color = ShoujoText, style = MaterialTheme.typography.bodySmall)
            if (journey.skills.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "🎴 Arts: " + journey.skills.entries.sortedBy { it.key }
                        .joinToString(" · ") { (k, v) ->
                            "$k $v" + if ((journey.limits[k] ?: 5) > 5) "★" else ""
                        },
                    color = ShoujoText, style = MaterialTheme.typography.bodySmall,
                )
            }
            if (journey.secret_skills.isNotEmpty()) {
                Text(
                    "✨ Secret: " + journey.secret_skills.joinToString(" · "),
                    color = ShoujoText, style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        // --- Actions: this is how you play ---
        StateCard(title = "🧭 Act") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Button(
                    onClick = { showTravel = true },
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("Travel", fontSize = 12.sp, maxLines = 1) }
                Button(
                    onClick = { onAct(ActRequest(action = "rest")) },
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("😴 Rest", fontSize = 12.sp, maxLines = 1) }
                Button(
                    onClick = { onAct(ActRequest(action = "search")) },
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("🔍 Search", fontSize = 12.sp, maxLines = 1) }
            }
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Button(
                    onClick = { showTalk = true },
                    enabled = !loading && journey.entities.isNotEmpty(),
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("💬 Talk", fontSize = 12.sp, maxLines = 1) }
                Button(
                    onClick = { showTrain = true },
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("🎴 Train", fontSize = 12.sp, maxLines = 1) }
                Button(
                    onClick = { onAct(ActRequest(action = "work")) },
                    enabled = !loading,
                    modifier = Modifier.weight(1f).height(40.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
                ) { Text("💰 Work", fontSize = 12.sp, maxLines = 1) }
            }
            if (journey.entities.isNotEmpty()) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedButton(
                    onClick = { showRitual = true },
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("🪬 Cast a ritual…") }
            } else {
                Text("Meet someone — or something — to unlock rituals.",
                    color = ShoujoText.copy(alpha = 0.6f), style = MaterialTheme.typography.bodySmall)
            }
        }

        StateCard(title = "🐱 Aiko · bond ${journey.bond}") {
            if (journey.standing_orders.isEmpty()) {
                Text("No standing orders — she acts on her own initiative.",
                    color = ShoujoText.copy(alpha = 0.75f), style = MaterialTheme.typography.bodySmall)
            } else {
                journey.standing_orders.forEach {
                    Text("• $it", color = ShoujoText, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        StateCard(title = "🎒 Inventory (${journey.inventory.size})") {
            Text(
                if (journey.inventory.isEmpty()) "(empty)" else journey.inventory.joinToString(" · "),
                color = ShoujoText, style = MaterialTheme.typography.bodySmall,
            )
        }

        if (journey.standing.isNotEmpty()) {
            StateCard(title = "⚖️ Standing") {
                journey.standing.forEach { (k, v) ->
                    Text("$k: $v", color = ShoujoText, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        StateCard(title = "👥 Known (${journey.entities.size})") {
            if (journey.entities.isEmpty()) {
                Text("No one met yet — the road awaits.", color = ShoujoText.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.bodySmall)
            } else {
                journey.entities.forEach { e ->
                    val face = if (e.kind == "spirit") "👻" else "🧑"
                    val who = e.name.ifBlank { "(unnamed)" }
                    Text(
                        "$face $who — ${e.role}".trim(),
                        color = ShoujoText, style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        if (journey.journey_summary.isNotBlank()) {
            StateCard(title = "📖 Journey so far") {
                Text(journey.journey_summary, color = ShoujoText, style = MaterialTheme.typography.bodySmall)
            }
        }

        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = PastelPurple),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                "💬 The narrator's full voice arrives in the next build — meanwhile you can already talk below ♡",
                color = ShoujoText, style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center, modifier = Modifier.padding(14.dp),
            )
        }

        TalkCard(
            journey = journey,
            loading = loading,
            onTalk = onTalk,
        )

        if (loading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text("The road unfolds…", color = ShoujoText)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("Title") }
            Button(onClick = onRefresh, enabled = !loading,
                colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo)) {
                Text(if (loading) "…" else "↻ Refresh")
            }
        }
        Spacer(modifier = Modifier.height(16.dp))

        if (showTravel) {
            var picked by remember(journey.location) { mutableStateOf<String?>(null) }
            AlertDialog(
                onDismissRequest = { showTravel = false },
                title = { Text("🧭 Travel the roads", fontWeight = FontWeight.Bold) },
                text = {
                    Column {
                        Text("One day per journey. From ${journey.location}:",
                            style = MaterialTheme.typography.bodySmall, color = ShoujoText)
                        Spacer(modifier = Modifier.height(8.dp))
                        (destinations.ifEmpty { listOf("Kyoto", "Azuchi", "Osaka", "Sakai", "Kiyosu", "Odawara") })
                            .filter { it != journey.location }
                            .forEach { d ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    androidx.compose.material3.RadioButton(
                                        selected = picked == d,
                                        onClick = { picked = d },
                                    )
                                    TextButton(onClick = { picked = d }) { Text(d) }
                                }
                            }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            picked?.let { onAct(ActRequest(action = "travel", to = it)) }
                            showTravel = false
                        },
                        enabled = picked != null && !loading,
                    ) { Text("Go") }
                },
                dismissButton = {
                    TextButton(onClick = { showTravel = false }) { Text("Stay") }
                },
            )
        }

        if (showTalk) {
            var pickedTarget by remember { mutableStateOf(journey.entities.firstOrNull()?.id ?: "") }
            AlertDialog(
                onDismissRequest = { showTalk = false },
                title = { Text("💬 Greet someone", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        journey.entities.forEach { e ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = pickedTarget == e.id,
                                    onClick = { pickedTarget = e.id },
                                )
                                TextButton(onClick = { pickedTarget = e.id }) {
                                    Text("${if (e.kind == "spirit") "👻" else "🧑"} ${e.name.ifBlank { e.id }}")
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            onAct(ActRequest(action = "talk", target = pickedTarget))
                            showTalk = false
                        },
                        enabled = pickedTarget.isNotBlank() && !loading,
                    ) { Text("Greet") }
                },
                dismissButton = {
                    TextButton(onClick = { showTalk = false }) { Text("Cancel") }
                },
            )
        }

        if (showTrain) {
            var pickedSkill by remember { mutableStateOf("divination") }
            AlertDialog(
                onDismissRequest = { showTrain = false },
                title = { Text("🎴 Train an art (1 day)", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("divination", "wards", "binding", "purification", "banishing").forEach { s ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = pickedSkill == s,
                                    onClick = { pickedSkill = s },
                                )
                                TextButton(onClick = { pickedSkill = s }) {
                                    Text("$s · lvl ${journey.skills[s] ?: 0}")
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            onAct(ActRequest(action = "train", skill = pickedSkill))
                            showTrain = false
                        },
                        enabled = !loading,
                    ) { Text("Train") }
                },
                dismissButton = {
                    TextButton(onClick = { showTrain = false }) { Text("Cancel") }
                },
            )
        }

        if (showRitual) {
            var pickedRitual by remember { mutableStateOf(rituals.firstOrNull() ?: "ward") }
            var pickedTarget by remember { mutableStateOf(journey.entities.firstOrNull()?.id ?: "") }
            AlertDialog(
                onDismissRequest = { showRitual = false },
                title = { Text("🪬 Cast a ritual", fontWeight = FontWeight.Bold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Rite (⚡ spirit cost):", style = MaterialTheme.typography.labelMedium, color = ShoujoText)
                        rituals.forEach { r ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = pickedRitual == r,
                                    onClick = { pickedRitual = r },
                                )
                                TextButton(onClick = { pickedRitual = r }) {
                                    Text("$r (${RITUAL_MP[r.trim().lowercase()] ?: "?"}⚡) · spirit ${journey.mp}/${journey.max_mp}")
                                }
                            }
                        }
                        Text("Target:", style = MaterialTheme.typography.labelMedium, color = ShoujoText)
                        journey.entities.forEach { e ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                androidx.compose.material3.RadioButton(
                                    selected = pickedTarget == e.id,
                                    onClick = { pickedTarget = e.id },
                                )
                                TextButton(onClick = { pickedTarget = e.id }) {
                                    Text("${if (e.kind == "spirit") "👻" else "🧑"} ${e.name.ifBlank { e.id }}")
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            onAct(ActRequest(action = "ritual", ritual = pickedRitual, target = pickedTarget))
                            showRitual = false
                        },
                        enabled = pickedTarget.isNotBlank() && !loading,
                    ) { Text("Cast") }
                },
                dismissButton = {
                    TextButton(onClick = { showRitual = false }) { Text("Cancel") }
                },
            )
        }
    }
}

private fun moralRank(moral: Int): String = when {    moral <= -30 -> "Feared"
    moral <= -10 -> "Shady"
    moral <= 9 -> "Unknown"
    moral <= 29 -> "Trusted"
    else -> "Virtuous"
}

@Composable
private fun VitalBar(label: String, value: Int, max: Int, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("$label $value/$max", color = ShoujoText, style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.width(110.dp))
        Spacer(modifier = Modifier.size(6.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .height(10.dp)
                .background(Color(0xFFE0E0E0), RoundedCornerShape(5.dp)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(if (max <= 0) 0f else (value.toFloat() / max).coerceIn(0f, 1f))
                    .height(10.dp)
                    .background(color, RoundedCornerShape(5.dp)),
            )
        }
    }
}

@Composable
private fun TalkCard(
    journey: JourneyState,
    loading: Boolean,
    onTalk: (String, String) -> Unit,
) {
    var target by remember(journey.entities) { mutableStateOf("aiko") }
    var draft by remember { mutableStateOf("") }
    // If the picked target vanishes (faded away), fall back to Aiko.
    if (target != "aiko" && journey.entities.none { it.id == target }) {
        target = "aiko"
    }
    StateCard(title = "💬 Talk") {
        if (journey.dialogue.isEmpty()) {
            Text("No words exchanged yet.", color = ShoujoText.copy(alpha = 0.6f),
                style = MaterialTheme.typography.bodySmall)
        } else {
            journey.dialogue.takeLast(8).forEach { line ->
                val who = when (line.who) {
                    "you" -> "You"
                    "aiko" -> "🐱 Aiko"
                    else -> "💬 ${line.who}"
                }
                Text(
                    "$who: ${line.text}",
                    color = if (line.who == "you") ShoujoText.copy(alpha = 0.8f) else ShoujoText,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = if (line.who == "you") FontWeight.Normal else FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(2.dp))
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TalkTargetChip(label = "🐱 Aiko", selected = target == "aiko", onClick = { target = "aiko" })
            journey.entities.forEach { e ->
                val label = "${if (e.kind == "spirit") "👻" else "🧑"} ${e.name.ifBlank { e.id }}"
                TalkTargetChip(label = label, selected = target == e.id, onClick = { target = e.id })
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { if (it.length <= 500) draft = it },
                placeholder = { Text("Say something…") },
                modifier = Modifier.weight(1f),
                maxLines = 3,
                singleLine = false,
            )
            Spacer(modifier = Modifier.size(8.dp))
            Button(
                onClick = {
                    onTalk(target, draft.trim())
                    draft = ""
                },
                enabled = !loading && draft.trim().isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = OnmyojiIndigo),
            ) { Text("Send") }
        }
    }
}

@Composable
private fun TalkTargetChip(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) {
        Button(
            onClick = {},
            enabled = false,
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
        ) { Text(label, fontSize = 12.sp, maxLines = 1) }
    } else {
        OutlinedButton(
            onClick = onClick,
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
        ) { Text(label, fontSize = 12.sp, maxLines = 1) }
    }
}

@Composable
private fun StateCard(title: String, body: @Composable () -> Unit) {    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.9f)),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.Bold, color = OnmyojiIndigo)
            body()
        }
    }
}
