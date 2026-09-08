"""Per-interview cost measurement (S1).

Records what an interview actually consumed, so pricing is a decision made
against a number rather than a guess. See rates.py for why the rate card is
versioned and why most line items are derived rather than measured.

WHAT IS MEASURED VS DERIVED
---------------------------
Measured (exact, from provider responses):
  - our own Gemini calls — handoff decisions, the final assessment, resume
    analysis — via `usage_metadata` on each response.
  - wall-clock interview duration.

Derived (estimated from the transcript, clearly labelled as such):
  - Murf TTS minutes, from the words the panel actually spoke.
  - Deepgram STT minutes, from the words the candidate actually spoke.
  - the in-pipeline conversation LLM's tokens.

The split exists because Agora's Conversational AI Engine runs the STT/LLM/TTS
loop in its own infrastructure using our keys, so none of that usage passes
through this process.

THREAD SAFETY
-------------
`CostMeter` is mutated from the asyncio event loop and from the transcript
callbacks the Agora SDK invokes. Every mutation is a single dict/counter
update under a lock, so a partially-applied update can never be read.
"""

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

try:
    # Package-relative — how pytest's package-aware import of `src` loads
    # this module (same reasoning as the try/except in server.py).
    from .rates import (
        CONVO_LLM_CONTEXT_MULTIPLIER,
        RATE_CARD_VERSION,
        TOKENS_PER_WORD,
        TTS_WORDS_PER_MINUTE,
        get_rate_card,
    )
except ImportError:
    # Bare top-level import — agent.py's own fallback import path loads
    # cost.py this way (conftest.py puts `server/src` on sys.path and does
    # `import agent`), and this module's directory is on sys.path there too.
    from rates import (
        CONVO_LLM_CONTEXT_MULTIPLIER,
        RATE_CARD_VERSION,
        TOKENS_PER_WORD,
        TTS_WORDS_PER_MINUTE,
        get_rate_card,
    )


def _word_count(text: str) -> int:
    return len((text or "").split())


@dataclass
class _GeminiCall:
    """One direct call we made to Gemini, with real token counts."""

    purpose: str
    prompt_tokens: int
    output_tokens: int


@dataclass
class InterviewCost:
    """One interview's usage and its cost under a specific rate card."""

    channel_name: str
    started_at: float
    ended_at: Optional[float] = None
    gemini_calls: List[_GeminiCall] = field(default_factory=list)
    agent_words: int = 0
    candidate_words: int = 0
    handoffs: int = 0

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    # -- recording ------------------------------------------------------

    def record_gemini_call(self, purpose: str, response: Any) -> None:
        """Capture real token counts off a Gemini response.

        Deliberately tolerant: a malformed or absent `usage_metadata` must
        never break an interview. Cost measurement is diagnostics, and
        diagnostics that can fail a live call are worse than no diagnostics.
        """
        prompt_tokens = 0
        output_tokens = 0
        try:
            usage = getattr(response, "usage_metadata", None)
            if usage is not None:
                prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0)
                output_tokens = int(getattr(usage, "candidates_token_count", 0) or 0)
        except Exception:  # noqa: BLE001 - never let accounting break a call
            prompt_tokens = 0
            output_tokens = 0

        with self._lock:
            self.gemini_calls.append(
                _GeminiCall(purpose=purpose, prompt_tokens=prompt_tokens, output_tokens=output_tokens)
            )

    def record_speech(self, *, is_agent: bool, text: str) -> None:
        """Count words spoken, the proxy for TTS and STT usage."""
        words = _word_count(text)
        if words == 0:
            return
        with self._lock:
            if is_agent:
                self.agent_words += words
            else:
                self.candidate_words += words

    def set_speech_from_transcript(self, transcript: List[Dict[str, Any]]) -> None:
        """Derive TTS and STT usage from the finished transcript.

        Counted here rather than per turn because the manager stores the
        transcript wholesale rather than appending to it — so reading it once
        at report time is both simpler and strictly more accurate than trying
        to shadow every SDK callback.
        """
        agent = 0
        candidate = 0
        for entry in transcript or []:
            text = str(entry.get("content") or "")
            if entry.get("role") == "user":
                candidate += _word_count(text)
            else:
                agent += _word_count(text)
        with self._lock:
            self.agent_words = agent
            self.candidate_words = candidate

    def record_handoff(self) -> None:
        """A persona switch restarts the Agora pipeline, which is worth
        counting separately — it is the mechanism by which the panel could
        cost more billable minutes than a single interviewer would."""
        with self._lock:
            self.handoffs += 1

    def finish(self) -> None:
        with self._lock:
            if self.ended_at is None:
                self.ended_at = time.time()

    # -- reporting ------------------------------------------------------

    def duration_minutes(self) -> float:
        end = self.ended_at if self.ended_at is not None else time.time()
        return max(0.0, (end - self.started_at) / 60.0)

    def to_dict(self, rate_card_version: str = RATE_CARD_VERSION) -> Dict[str, Any]:
        """Usage and estimated cost, ready to persist on the session."""
        rates = get_rate_card(rate_card_version)

        with self._lock:
            gemini_calls = list(self.gemini_calls)
            agent_words = self.agent_words
            candidate_words = self.candidate_words
            handoffs = self.handoffs

        minutes = self.duration_minutes()

        # --- measured ---
        direct_prompt_tokens = sum(c.prompt_tokens for c in gemini_calls)
        direct_output_tokens = sum(c.output_tokens for c in gemini_calls)
        direct_gemini_usd = (
            direct_prompt_tokens / 1_000_000 * rates["gemini_flash_input_per_1m_tokens_usd"]
            + direct_output_tokens / 1_000_000 * rates["gemini_flash_output_per_1m_tokens_usd"]
        )

        # --- derived ---
        tts_minutes = agent_words / TTS_WORDS_PER_MINUTE if agent_words else 0.0
        # STT bills the whole streamed call, not just the candidate's speech —
        # the socket is open for the full interview.
        stt_minutes = minutes

        convo_output_tokens = int(agent_words * TOKENS_PER_WORD)
        convo_input_tokens = int(
            (agent_words + candidate_words) * TOKENS_PER_WORD * CONVO_LLM_CONTEXT_MULTIPLIER
        )
        convo_gemini_usd = (
            convo_input_tokens / 1_000_000 * rates["gemini_flash_input_per_1m_tokens_usd"]
            + convo_output_tokens / 1_000_000 * rates["gemini_flash_output_per_1m_tokens_usd"]
        )

        agora_usd = minutes * rates["agora_convo_ai_per_minute_usd"]
        murf_usd = tts_minutes * rates["murf_falcon_per_minute_usd"]
        deepgram_usd = stt_minutes * rates["deepgram_nova3_streaming_per_minute_usd"]

        total = agora_usd + murf_usd + deepgram_usd + direct_gemini_usd + convo_gemini_usd

        return {
            "rateCardVersion": rate_card_version,
            "durationMinutes": round(minutes, 3),
            "handoffs": handoffs,
            "measured": {
                "geminiDirectCalls": len(gemini_calls),
                "geminiPromptTokens": direct_prompt_tokens,
                "geminiOutputTokens": direct_output_tokens,
                "byPurpose": _group_by_purpose(gemini_calls),
            },
            "derived": {
                "agentWords": agent_words,
                "candidateWords": candidate_words,
                "ttsMinutes": round(tts_minutes, 3),
                "sttMinutes": round(stt_minutes, 3),
                "convoLlmInputTokens": convo_input_tokens,
                "convoLlmOutputTokens": convo_output_tokens,
            },
            "breakdownUsd": {
                "agora": round(agora_usd, 5),
                "murfTts": round(murf_usd, 5),
                "deepgramStt": round(deepgram_usd, 5),
                "geminiDirect": round(direct_gemini_usd, 5),
                "geminiConversation": round(convo_gemini_usd, 5),
            },
            "totalUsd": round(total, 4),
            # The single most useful field for pricing: what share of the bill
            # is the one line we cannot reduce by writing better code.
            "agoraShareOfTotal": round(agora_usd / total, 3) if total > 0 else None,
            "confidence": "derived",
        }


def _group_by_purpose(calls: List[_GeminiCall]) -> Dict[str, Dict[str, int]]:
    """Token totals per call site, so an expensive one is visible.

    Handoff decisions are the sleeper cost: one call per candidate answer,
    each carrying the transcript so far, so their total grows with the square
    of interview length rather than linearly.
    """
    grouped: Dict[str, Dict[str, int]] = {}
    for call in calls:
        entry = grouped.setdefault(call.purpose, {"calls": 0, "promptTokens": 0, "outputTokens": 0})
        entry["calls"] += 1
        entry["promptTokens"] += call.prompt_tokens
        entry["outputTokens"] += call.output_tokens
    return grouped


class CostRegistry:
    """Per-channel cost meters, with the same lifetime as the transcripts."""

    def __init__(self) -> None:
        self._meters: Dict[str, InterviewCost] = {}
        self._lock = threading.Lock()

    def start(self, channel_name: str) -> InterviewCost:
        with self._lock:
            meter = self._meters.get(channel_name)
            if meter is None:
                meter = InterviewCost(channel_name=channel_name, started_at=time.time())
                self._meters[channel_name] = meter
            return meter

    def get(self, channel_name: str) -> Optional[InterviewCost]:
        with self._lock:
            return self._meters.get(channel_name)

    def finish(self, channel_name: str) -> Optional[InterviewCost]:
        meter = self.get(channel_name)
        if meter is not None:
            meter.finish()
        return meter

    def discard(self, channel_name: str) -> None:
        with self._lock:
            self._meters.pop(channel_name, None)


# --- Ambient meter ----------------------------------------------------
#
# The orchestrator and assessor classes are per-manager, not per-interview,
# and their internal helpers are several calls deep. Threading a channel name
# through six signatures to do accounting would put bookkeeping in the
# signature of every piece of interview logic.
#
# A ContextVar carries it instead. `asyncio.to_thread` copies the current
# context into the worker thread, so a meter set on the event loop is visible
# inside the Gemini call it wraps. Set it once at the entry point that knows
# the channel (`_monitor_panel`, `get_assessment`); everything below sees it.
from contextvars import ContextVar

current_cost_meter: ContextVar[Optional[InterviewCost]] = ContextVar(
    "current_cost_meter", default=None
)


def record_gemini_usage(purpose: str, response: Any) -> Any:
    """Attribute a Gemini response to the ambient meter, if there is one.

    Returns the response so it can wrap a call inline. A missing meter is
    normal — practice interviews and any call made outside an interview simply
    are not metered.
    """
    meter = current_cost_meter.get()
    if meter is not None:
        meter.record_gemini_call(purpose, response)
    return response
