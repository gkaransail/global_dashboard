from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "FinanceIQ — Market Intelligence"
    version: str = "1.0.0"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # Cache TTL in seconds
    data_cache_ttl: int = 300
    signal_cache_ttl: int = 60

    # Thresholds
    reversal_confidence_threshold: float = 0.55
    strong_signal_threshold: float = 0.75

    # AI provider: "groq" (free, default) or "anthropic" (paid)
    # If not set, auto-detects from whichever API key is present
    ai_provider: str = ""

    # Groq (free tier — 14,400 req/day on Llama 3.3 70B)
    groq_api_key: str = ""

    # Anthropic (fallback / optional)
    anthropic_api_key: str = ""

    # Supabase (persistent cache + chat history + scan results)
    supabase_url: str = ""
    supabase_key: str = ""   # use service role key, not anon

    class Config:
        env_file = ".env"


settings = Settings()


# ── Feature flags ────────────────────────────────────────────────────────────
# Change "free" → "pro" to gate any feature behind a Pro subscription tier.
# require_feature() reads from here — no other code changes needed.

FEATURE_FLAGS: dict[str, str] = {
    "reversal":        "free",
    "options":         "free",
    "earnings":        "free",
    "technical":       "free",
    "fundamental":     "free",
    "sentiment":       "free",
    "insider":         "free",
    "congress":        "free",
    "smart_money":     "free",
    "market_intel":    "free",
    "ai_agent":        "free",   # set to "pro" to gate behind subscription
    "portfolio":       "free",
    "alerts":          "free",
    "institutional":   "free",
}


def get_required_tier(feature: str) -> str:
    return FEATURE_FLAGS.get(feature, "pro")
