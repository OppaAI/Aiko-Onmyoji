package com.aiko.onmyoji.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Entity(
    val id: String = "",
    val kind: String = "human", // human | spirit
    val name: String = "",
    val role: String = "",
    val disposition: String = "",
    val details: List<String> = emptyList(),
    val dread: Int = 0, // 0 whimsical – 3 folk-horror (spirits)
    val tier: String = "passing", // anchor | bonded | passing
    val last_seen: String = "",
    val location: String = "",
)

@Serializable
data class DialogueLine(
    val who: String = "",
    val target: String = "",
    val text: String = "",
)

@Serializable
data class JourneyState(
    val date: String = "1582-06-01",
    val location: String = "Kyoto",
    val inventory: List<String> = emptyList(),
    val standing: Map<String, Int> = emptyMap(),
    val bond: Int = 0,
    val standing_orders: List<String> = emptyList(),
    val journey_summary: String = "",
    val entities: List<Entity> = emptyList(),
    val flags: List<String> = emptyList(),
    val dialogue: List<DialogueLine> = emptyList(),
    val hp: Int = 10,
    val max_hp: Int = 10,
    val mp: Int = 10,
    val max_mp: Int = 10,
    val skills: Map<String, Int> = emptyMap(),
    val secret_skills: List<String> = emptyList(),
    val limits: Map<String, Int> = emptyMap(),
    val morality: Int = 0,
)

@Serializable
data class StartRequest(
    val location: String = "Kyoto",
    val date: String = "1582-06-01",
)

@Serializable
data class HealthResponse(
    val ok: Boolean = false,
    val game: String = "",
    val phase: Int = 0,
)

@Serializable
data class ActRequest(
    val action: String = "",
    val to: String = "",
    val ritual: String = "",
    val target: String = "",
    val skill: String = "",
)

@Serializable
data class ActResponse(
    val journey: JourneyState = JourneyState(),
    val events: List<String> = emptyList(),
)

@Serializable
data class ActOptions(
    val actions: List<String> = emptyList(),
    val destinations: List<String> = emptyList(),
    val all_places: List<String> = emptyList(),
    val rituals: List<String> = emptyList(),
)

@Serializable
data class TalkRequest(
    val target: String = "aiko",
    val message: String = "",
)

@Serializable
data class TalkResponse(
    val journey: JourneyState = JourneyState(),
    val reply: String = "",
    val events: List<String> = emptyList(),
)
