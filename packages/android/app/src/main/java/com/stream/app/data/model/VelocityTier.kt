package com.stream.app.data.model

/** Velocity tiers with their half-life in hours. */
enum class VelocityTier(val tier: Int, val halfLifeHours: Double, val label: String) {
    BREAKING(1, 3.0, "3h"),
    NEWS(2, 12.0, "12h"),
    ARTICLE(3, 24.0, "24h"),
    ESSAY(4, 72.0, "72h"),
    EVERGREEN(5, 168.0, "7d");

    companion object {
        private val byTier = entries.associateBy { it.tier }

        fun fromTier(tier: Int): VelocityTier = byTier[tier] ?: ARTICLE

        fun halfLifeForTier(tier: Int): Double = fromTier(tier).halfLifeHours
    }
}
