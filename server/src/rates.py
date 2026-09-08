"""Provider rate card for interview cost estimation (S1).

WHY A DATED TABLE AND NOT CONSTANTS
-----------------------------------
Rates change. If cost were computed once and stored as a number, a price
change would silently make every historical figure wrong, and there would be
no way to tell which sessions were priced under which rates. So each session
records the `version` of the card used, and the raw usage signals alongside
the money. Re-pricing history is then a pure function of stored usage.

THESE ARE PUBLIC LIST PRICES, NOT YOUR CONTRACT
-----------------------------------------------
Every figure below is a published rate as of the version date. If Knotic has
negotiated pricing with any provider, override it here and bump the version —
do not edit a published card in place, or older sessions will silently
re-price.

THE SHAPE OF THE BILL
---------------------
Agora's Conversational AI Engine runs the STT -> LLM -> TTS loop itself, using
our API keys (see `_build_agora_agent` in agent.py). Two consequences:

  1. Per-turn token and character usage for the *conversation* never reaches
     this process. It has to be derived from the transcript and the call
     duration — hence `confidence: "derived"` on those line items.
  2. Agora bills per active minute *on top of* whatever each provider bills
     us directly. At $0.10/min that single line dominates everything else: a
     15-minute interview is $1.50 before a token of Gemini or a character of
     Murf. Duration accuracy therefore matters far more than token counting.
"""

from typing import Dict

RATE_CARD_VERSION = "2026-09"

RATE_CARDS: Dict[str, Dict[str, float]] = {
    "2026-09": {
        # Agora Conversational AI Engine, per active agent minute. The single
        # largest line item by a wide margin.
        "agora_convo_ai_per_minute_usd": 0.10,
        # Murf Falcon (MURF_MODEL default) bills per minute of generated
        # audio. The character rate is kept for the standard TTS models.
        "murf_falcon_per_minute_usd": 0.01,
        "murf_standard_per_1k_chars_usd": 0.03,
        # Deepgram nova-3, streaming (this pipeline is live, not batch).
        "deepgram_nova3_streaming_per_minute_usd": 0.0077,
        # Gemini 2.0 Flash text pricing, per 1M tokens. Used for both our
        # direct calls (measured) and the in-pipeline conversation (derived).
        "gemini_flash_input_per_1m_tokens_usd": 0.10,
        "gemini_flash_output_per_1m_tokens_usd": 0.40,
    }
}

# --- Derivation constants ---------------------------------------------
#
# Used only for the line items Agora hides from us. Each is a stated
# assumption, not a measurement — which is exactly why the resulting figures
# are labelled "derived" and why S1's acceptance criterion is a *median*
# rather than an exact number.

# Average spoken rate for TTS output, words per minute. Murf's default cadence
# sits near this; WORDS_PER_SECOND in agent.py assumes 2.3 w/s = 138 wpm for
# the same reason.
TTS_WORDS_PER_MINUTE = 138.0

# Rough tokens per word for English prose through Gemini's tokenizer.
TOKENS_PER_WORD = 1.35

# The conversation LLM re-reads its context on every turn, so its input token
# count grows with the transcript rather than staying flat. This multiplier
# approximates that accumulation against the final transcript length; it is
# the crudest number here and the first thing to calibrate against a real bill.
CONVO_LLM_CONTEXT_MULTIPLIER = 6.0


def get_rate_card(version: str = RATE_CARD_VERSION) -> Dict[str, float]:
    """Return a rate card by version, defaulting to the current one."""
    if version not in RATE_CARDS:
        raise KeyError(
            f"Unknown rate card version {version!r}. "
            f"Known versions: {', '.join(sorted(RATE_CARDS))}"
        )
    return RATE_CARDS[version]
