package com.aiko.onmyoji.engine

import com.aiko.onmyoji.data.model.Entity

object SpriteLibrary {
    /**
     * Injects randomized or predefined historical characters/positions depending on the active location.
     * This creates a rich interactive world overlay on top of any active server/local state.
     */
    fun enrichEntities(currentEntities: List<Entity>, location: String): List<Entity> {
        val enriched = currentEntities.mapIndexed { index, entity ->
            if (entity.x == 0f && entity.y == 0f) {
                // Give standard/server NPCs varied initial coordinates around the path
                entity.copy(
                    x = 4f + (index * 2) % 8,
                    y = 3f + (index * 3) % 10
                )
            } else {
                entity
            }
        }.toMutableList()

        // Inject iconic historical characters depending on location if they are not present
        if (location == "Kyoto" && enriched.none { it.id == "nobunaga" }) {
            enriched.add(
                Entity(
                    id = "nobunaga",
                    kind = "human",
                    name = "Oda Nobunaga",
                    role = "Daimyo of Japan",
                    disposition = "Stern & ambitious",
                    details = listOf("Staying at Honno-ji temple", "Planning unification"),
                    x = 7f,
                    y = 2f
                )
            )
            enriched.add(
                Entity(
                    id = "mitsuhide",
                    kind = "human",
                    name = "Akechi Mitsuhide",
                    role = "General",
                    disposition = "Pensive & conflicted",
                    details = listOf("Guarding the southern perimeter", "Watching the skies"),
                    x = 7f,
                    y = 13f
                )
            )
        } else if (location == "Azuchi" && enriched.none { it.id == "ranmaru" }) {
            enriched.add(
                Entity(
                    id = "ranmaru",
                    kind = "human",
                    name = "Mori Ranmaru",
                    role = "Page / Attendant",
                    disposition = "Loyal & alert",
                    details = listOf("Guarding Azuchi castle gates"),
                    x = 5f,
                    y = 5f
                )
            )
        }

        // Add an evil wandering spirit to trigger the battle view if none exists
        if (enriched.none { it.kind == "spirit" && it.id != "aiko" }) {
            enriched.add(
                Entity(
                    id = "gaki",
                    kind = "spirit",
                    name = "Wandering Gaki",
                    role = "Hungry Ghost",
                    disposition = "Aggressive",
                    details = listOf("Corrupted by war ash"),
                    dread = 2,
                    x = 11f,
                    y = 11f
                )
            )
        }

        return enriched
    }
}
