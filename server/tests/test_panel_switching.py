"""Panel handoff should switch interviewer voice by restarting the pipeline,
driven by the (mocked) orchestrator's decision — and the shared transcript
must stitch correctly across restarts for later assessment.
"""
import asyncio
import contextlib
import sys
from types import SimpleNamespace


def _fresh_agent_module():
    sys.modules.pop("agent", None)
    import agent
    return agent


def _msg(role, content):
    return SimpleNamespace(role=role, content=content)


def test_panel_handoff_restarts_pipeline_with_new_voice(fake_env, monkeypatch):
    monkeypatch.setenv("PANEL_POLL_INTERVAL_SECONDS", "0.01")
    monkeypatch.setenv("PANEL_MIN_SECONDS_BETWEEN_SWITCHES", "0")
    # Both of these are real wall-clock waits in production (the panel waits
    # for the candidate to actually stop talking, then lets the outgoing
    # voice drain before the next one comes up). Shortened rather than
    # zeroed so the settle gate is still genuinely exercised — the
    # deliberation below must not fire on the interviewer's own turn.
    monkeypatch.setenv("PANEL_CANDIDATE_SETTLE_SECONDS", "0.005")
    monkeypatch.setenv("PANEL_HANDOFF_DRAIN_SECONDS", "0.01")
    agent = _fresh_agent_module()

    # Which interviewer opens is drawn at random in production (see start()).
    # Pinned to the first here so this test can talk about a specific
    # technical-interviewer -> product-manager handoff; that the opener really
    # does vary is covered by its own test below.
    monkeypatch.setattr(agent.random, "choice", lambda seq: list(seq)[0])

    # One poll per batch, mirroring how the real API streams a conversation —
    # including the fact that the live session usually answers the candidate
    # before this loop's next poll, so a single batch carries the answer AND
    # the incumbent's reply together. The panel must still weigh in on that
    # answer; requiring the candidate to have the last word is what silently
    # disabled handoffs entirely in a real interview.
    #
    # The empty batches are load-bearing, not padding: they are the candidate
    # having actually STOPPED talking. The panel deliberates only after a
    # stretch of quiet, because a chunk of speech landing says nothing about
    # whether the answer is finished. get_history() is cumulative within a
    # session and resets for the next session after a restart.
    technical_batches = [
        [],
        [_msg("user", "I built a caching layer that cut latency from 800ms to 200ms.")],
        [],  # candidate stops talking — panel weighs in, and chooses to stay
        # Answer and the incumbent's reply land in the same poll, as they do
        # in practice. This must still count as an answer to deliberate on.
        [
            _msg("user", "It let checkout stay under 300ms even during flash sales."),
            _msg("assistant", "And what did that do to conversion?"),
        ],
        [],  # settle — this is the answer that wins a handoff
    ]

    decisions = iter(
        [
            None,
            {
                "next_interviewer": "product_manager",
                "action": "ask about customer impact",
                "reason": "technical evidence is sufficient",
                "difficulty": "medium",
            },
        ]
    )

    decide_calls = []

    # `deliberate` is the monitor's entry point: in production it drafts a
    # follow-up from all three interviewers in parallel and has a judge pick
    # the winner. Stubbed here so this test stays about the handoff pipeline
    # — that the winning persona's voice actually takes over the channel and
    # the transcript stitches across the restart.
    async def fake_deliberate(self, role_context, current_interviewer, transcript, panel_stats=None):
        decide_calls.append(transcript[-1]["role"])
        return next(decisions, None)

    monkeypatch.setattr(agent.PanelOrchestrator, "deliberate", fake_deliberate)

    sessions = []

    # Derived from the module rather than hardcoded: these are configurable
    # per-persona voice names, and hardcoding them here is what silently
    # broke this test the last time they were renamed (it kept feeding
    # history to a session that never came up first, so no handoff could
    # ever be observed).
    technical_voice = agent.PANEL_VOICES["technical_interviewer"]
    product_voice = agent.PANEL_VOICES["product_manager"]

    class FakeSession:
        def __init__(self, voice_id):
            self.voice_id = voice_id
            self.stopped = False
            self._pending_batches = list(technical_batches) if voice_id == technical_voice else []
            self._accumulated = []

        async def start(self):
            return f"agent-{self.voice_id}-{len(sessions)}"

        async def stop(self):
            self.stopped = True

        async def get_history(self):
            if self._pending_batches:
                self._accumulated.extend(self._pending_batches.pop(0))
            return SimpleNamespace(contents=list(self._accumulated))

    def fake_create_async_session(self, **kwargs):
        voice_id = self._tts["params"]["voiceId"]
        session = FakeSession(voice_id)
        sessions.append(session)
        return session

    from agora_agent.agentkit import Agent as AgoraAgent
    monkeypatch.setattr(AgoraAgent, "create_async_session", fake_create_async_session)

    async def main():
        instance = agent.Agent()
        result = await instance.start(
            channel_name="ch",
            agent_uid=111,
            user_uid=222,
            role="Backend Engineer",
            company="Acme",
            job_description="Own our payments service.",
        )
        assert result["status"] == "started"
        assert result["current_interviewer"] == "technical_interviewer"
        assert result["panel"] == ["Technical Interviewer", "Product Manager", "Hiring Manager"]

        # A handoff deliberately waits out the outgoing interviewer's
        # remaining TTS playback (_estimate_speech_seconds) before restarting
        # the pipeline, which for the line above is several seconds. Budget
        # past that — the loop still exits the moment the restart lands, so
        # the cost is only paid if something is actually broken.
        deadline = asyncio.get_event_loop().time() + 15
        while len(sessions) < 2 and asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(0.02)

        assert len(sessions) == 2, "expected the pipeline to restart once on handoff"
        # Deliberated once per candidate answer — including the answer that
        # arrived in the same poll as the incumbent's reply, where the last
        # transcript entry is the interviewer rather than the candidate.
        assert decide_calls == ["user", "assistant"]
        assert sessions[0].voice_id == technical_voice
        assert sessions[1].voice_id == product_voice
        assert sessions[0].stopped is True

        state = instance._channels["ch"]
        assert state["current_interviewer"] == "product_manager"
        assert state["session"] is sessions[1]
        assert state["last_switch_reason"] == "technical evidence is sufficient"

        # Shared transcript stitched across the restart, tagged by speaker.
        transcript = instance._transcripts["ch"]
        interviewers_seen = {e["interviewer"] for e in transcript if e["role"] != "user"}
        assert "technical_interviewer" in interviewers_seen
        assert any(e["role"] == "user" for e in transcript)

        panel_state = instance.get_panel_state("ch")
        assert panel_state["current_interviewer"] == "product_manager"
        assert [p["active"] for p in panel_state["panel"]] == [False, True, False]

        # The one real handoff is on record as a switched decision — this is
        # the wiring the "adaptive intelligence" results-screen numbers
        # actually read from, not just the unit-level counting logic.
        decision_log = instance._decision_logs["ch"]
        assert any(d["switched"] and d["to_interviewer"] == "product_manager" for d in decision_log)

        await instance.stop(channel_name="ch")
        assert sessions[1].stopped is True
        assert "ch" not in instance._channels
        # Transcript, role context, and decision log all survive past stop()
        # for scoring — get_assessment() runs well after the call has ended.
        assert instance._transcripts["ch"] is transcript
        assert instance._role_contexts["ch"]
        assert instance._decision_logs["ch"] is decision_log

    asyncio.run(main())


def test_forced_rotation_prefers_the_quietest_panelist(fake_env):
    """The panel reliably under-rotates on its own judgment, which let one
    interviewer run whole sessions. _forced_rotation_target is the backstop:
    after MAX_ANSWERS_BEFORE_ROTATION answers on one interviewer, the floor
    goes to whoever has spoken least."""
    agent = _fresh_agent_module()

    # Under the threshold — nobody is forced off the floor yet.
    assert (
        agent.Agent._forced_rotation_target(
            {
                "current_interviewer": "technical_interviewer",
                "answers_since_switch": agent.MAX_ANSWERS_BEFORE_ROTATION - 1,
                "turns_by_interviewer": {"technical_interviewer": 1, "product_manager": 0, "hiring_manager": 0},
            }
        )
        is None
    )

    # At the threshold, the panelist who has never spoken takes over — not
    # simply the next one in PANEL_ORDER. A clear least-airtime winner is
    # still chosen outright; randomness only settles ties (below).
    assert (
        agent.Agent._forced_rotation_target(
            {
                "current_interviewer": "technical_interviewer",
                "answers_since_switch": agent.MAX_ANSWERS_BEFORE_ROTATION,
                "turns_by_interviewer": {"technical_interviewer": 4, "product_manager": 2, "hiring_manager": 0},
            }
        )
        == "hiring_manager"
    )


def test_forced_rotation_breaks_ties_randomly(fake_env):
    """A fixed tie-break sent the first handoff of every interview to the same
    interviewer, and the session tended to walk the same rota from there —
    the scripted feel this randomness exists to remove. Both tied panelists
    must be reachable, and the one currently holding the floor never is."""
    agent = _fresh_agent_module()

    state = {
        "current_interviewer": "hiring_manager",
        "answers_since_switch": agent.MAX_ANSWERS_BEFORE_ROTATION + 3,
        "turns_by_interviewer": {"technical_interviewer": 2, "product_manager": 2, "hiring_manager": 5},
    }
    seen = {agent.Agent._forced_rotation_target(state) for _ in range(200)}

    # Both tied candidates come up, and the current speaker never does.
    assert seen == {"technical_interviewer", "product_manager"}


def test_assessment_uses_cached_result_and_stitched_transcript(fake_env, monkeypatch):
    agent = _fresh_agent_module()

    call_count = {"n": 0}

    async def fake_assess(self, role_context, transcript, job=None):
        call_count["n"] += 1
        return {"overall_score": 6.5, "competencies": [], "error": False}

    monkeypatch.setattr(agent.PanelAssessor, "assess", fake_assess)

    instance = agent.Agent()
    instance._transcripts["ch"] = [{"role": "user", "content": "hello", "interviewer": "technical_interviewer"}]
    instance._role_contexts["ch"] = "Position: Backend Engineer."

    async def main():
        first = await instance.get_assessment("ch")
        second = await instance.get_assessment("ch")
        assert first == second
        assert call_count["n"] == 1  # cached on the second call

    asyncio.run(main())


def test_assessment_without_transcript_raises(fake_env):
    agent = _fresh_agent_module()
    instance = agent.Agent()

    async def main():
        try:
            await instance.get_assessment("missing-channel")
        except ValueError:
            return
        raise AssertionError("expected ValueError for a channel with no transcript")

    asyncio.run(main())


def _drafted(persona, line, relevance):
    return {"interviewer": persona, "line": line, "action": f"probe {persona}", "relevance": relevance}


def test_deliberation_asks_every_interviewer_and_speaks_the_winners_own_line(fake_env, monkeypatch):
    """Every candidate answer goes to all three interviewers, each drafting the
    follow-up they would ask from their own seat; a judge then picks which one
    the panel actually asks. The winner must speak THEIR OWN drafted line —
    putting one interviewer's question in another's mouth is the failure mode
    this two-stage split exists to prevent."""
    agent = _fresh_agent_module()
    orchestrator = agent.PanelOrchestrator("fake-model", enabled=True)

    asked = []

    async def fake_draft(self, persona, role_context, transcript, recent_openers):
        asked.append(persona)
        return _drafted(persona, f"{persona} would ask this", relevance=5)

    async def fake_judge(self, role_context, transcript, drafts, panel_stats):
        return {
            "scores": [
                {"interviewer": "technical_interviewer", "score": 3},
                {"interviewer": "product_manager", "score": 9},
                {"interviewer": "hiring_manager", "score": 2},
            ],
            "winner": "product_manager",
            "reason": "the claim is a customer-impact claim, not an implementation one",
        }

    monkeypatch.setattr(agent.PanelOrchestrator, "_draft_perspective", fake_draft)
    monkeypatch.setattr(agent.PanelOrchestrator, "_judge_perspectives", fake_judge)

    decision = asyncio.run(
        orchestrator.deliberate("Position: Backend Engineer.", "technical_interviewer", [{"role": "user", "content": "hi"}])
    )

    # All three were consulted, not just the incumbent and the next in line.
    assert sorted(asked) == sorted(agent.PANEL_ORDER)
    assert decision["next_interviewer"] == "product_manager"
    assert decision["handoff_line"] == "product_manager would ask this"
    # Every draft is carried through for post-interview review.
    assert {p["interviewer"] for p in decision["perspectives"]} == set(agent.PANEL_ORDER)


def test_deliberation_breaks_close_calls_randomly(fake_env, monkeypatch):
    """Scores within a point of each other are a genuine tie on a 0-10 rubric.
    Always taking the first listed made the panel walk the same rota every
    interview — the scripted feel this randomness removes. A clear winner
    must still win outright (asserted below)."""
    agent = _fresh_agent_module()
    orchestrator = agent.PanelOrchestrator("fake-model", enabled=True)

    async def fake_draft(self, persona, role_context, transcript, recent_openers):
        return _drafted(persona, f"{persona} line", relevance=5)

    async def near_tie_judge(self, role_context, transcript, drafts, panel_stats):
        return {
            "scores": [
                {"interviewer": "technical_interviewer", "score": 8.0},
                {"interviewer": "product_manager", "score": 7.5},
                {"interviewer": "hiring_manager", "score": 2.0},
            ],
            "winner": "technical_interviewer",
            "reason": "close call",
        }

    monkeypatch.setattr(agent.PanelOrchestrator, "_draft_perspective", fake_draft)
    monkeypatch.setattr(agent.PanelOrchestrator, "_judge_perspectives", near_tie_judge)

    async def main():
        return {
            (await orchestrator.deliberate("ctx", "hiring_manager", [{"role": "user", "content": "hi"}]))[
                "next_interviewer"
            ]
            for _ in range(200)
        }

    winners = asyncio.run(main())
    # The two near-tied interviewers both come up; the clearly-worse one never does.
    assert winners == {"technical_interviewer", "product_manager"}


def test_deliberation_falls_back_when_every_draft_fails(fake_env, monkeypatch):
    """A model hiccup must never leave the panel silent: if no interviewer
    manages to draft anything, the single-call orchestrator still decides."""
    agent = _fresh_agent_module()
    orchestrator = agent.PanelOrchestrator("fake-model", enabled=True)

    async def failed_draft(self, persona, role_context, transcript, recent_openers):
        return None

    async def fake_decide(self, role_context, current_interviewer, transcript, panel_stats=None):
        return {"next_interviewer": "hiring_manager", "handoff_line": "fallback line"}

    monkeypatch.setattr(agent.PanelOrchestrator, "_draft_perspective", failed_draft)
    monkeypatch.setattr(agent.PanelOrchestrator, "decide", fake_decide)

    decision = asyncio.run(
        orchestrator.deliberate("ctx", "technical_interviewer", [{"role": "user", "content": "hi"}])
    )
    assert decision["next_interviewer"] == "hiring_manager"


def test_requested_interviewer_only_fires_on_an_actual_request(fake_env):
    """The candidate naming a role is not the same as asking for them. This
    runs before the panel decides whether to deliberate at all, so a false
    positive would yank the floor to a different interviewer mid-answer over
    a passing mention of a previous employer."""
    agent = _fresh_agent_module()

    # Genuine requests.
    assert agent._requested_interviewer("Can I talk to the product manager about this?") == "product_manager"
    assert agent._requested_interviewer("Could I hear from the hiring manager?") == "hiring_manager"

    # Passing mentions — no request, no handoff.
    assert agent._requested_interviewer("The hiring manager at my last company disagreed.") is None
    assert agent._requested_interviewer("I worked closely with our product manager on that.") is None
    assert agent._requested_interviewer("") is None


def test_incumbent_replying_instantly_cannot_lock_out_the_panel(fake_env, monkeypatch):
    """The regression that let one interviewer run a whole interview.

    The live session answers the candidate within a second or two, while this
    loop polls on an interval — so in practice a single poll almost always
    carries the candidate's answer AND the incumbent's reply together. While
    the panel only deliberated when the candidate had the *last word*, that
    meant it deliberated essentially never: real interviews ran start to
    finish with only the technical interviewer speaking, and the other two
    never said a word. Every candidate answer must get a deliberation, even
    though the incumbent has already jumped on it.
    """
    monkeypatch.setenv("PANEL_POLL_INTERVAL_SECONDS", "0.01")
    monkeypatch.setenv("PANEL_MIN_SECONDS_BETWEEN_SWITCHES", "0")
    monkeypatch.setenv("PANEL_CANDIDATE_SETTLE_SECONDS", "0.005")
    monkeypatch.setenv("PANEL_HANDOFF_DRAIN_SECONDS", "0.01")
    agent = _fresh_agent_module()

    # Three exchanges, each one answer + an instant reply in the same poll —
    # the incumbent never leaves the candidate with the last word.
    batches = []
    for i in range(3):
        batches.append(
            [_msg("user", f"answer number {i}"), _msg("assistant", f"and a follow-up question {i}")]
        )
        batches.append([])  # the quiet the settle gate waits for

    deliberations = []

    async def fake_deliberate(self, role_context, current_interviewer, transcript, panel_stats=None):
        deliberations.append(current_interviewer)
        return None  # never switch; this test is only about being consulted

    monkeypatch.setattr(agent.PanelOrchestrator, "deliberate", fake_deliberate)

    class FakeSession:
        def __init__(self, voice_id):
            self.voice_id = voice_id
            self.stopped = False
            self._pending = list(batches)
            self._accumulated = []

        async def start(self):
            return "agent-1"

        async def stop(self):
            self.stopped = True

        async def get_history(self):
            if self._pending:
                self._accumulated.extend(self._pending.pop(0))
            return SimpleNamespace(contents=list(self._accumulated))

    def fake_create_async_session(self, **kwargs):
        return FakeSession(self._tts["params"]["voiceId"])

    from agora_agent.agentkit import Agent as AgoraAgent
    monkeypatch.setattr(AgoraAgent, "create_async_session", fake_create_async_session)

    async def main():
        instance = agent.Agent()
        await instance.start(channel_name="ch", agent_uid=111, user_uid=222, role="Backend Engineer")

        deadline = asyncio.get_event_loop().time() + 5
        while len(deliberations) < 3 and asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(0.02)

        await instance.stop(channel_name="ch")

    asyncio.run(main())

    # One deliberation per candidate answer — not zero, which is what the
    # "candidate must have the last word" gate actually produced.
    assert len(deliberations) == 3, f"expected a deliberation per answer, got {len(deliberations)}"


def test_opening_interviewer_varies_between_interviews(fake_env, monkeypatch):
    """Every interview used to open in the same voice, with the same
    engineering-first framing — and whoever opens also fields the answer to
    "tell me about yourself", which sets the tone for everything after it.
    The greeting must name whoever actually opened, and correctly name the
    other two as the panel still to come."""
    agent = _fresh_agent_module()

    greetings = {}

    def capture(self, persona, role_context, output_audio_codec, greeting=None, **kwargs):
        greetings[persona] = greeting
        raise RuntimeError("stop here — the greeting is all this test needs")

    monkeypatch.setattr(agent.Agent, "_build_agora_agent", capture)

    async def open_once():
        instance = agent.Agent()
        try:
            await instance.start(channel_name="ch", agent_uid=111, user_uid=222, role="Backend Engineer")
        except RuntimeError:
            pass

    for _ in range(60):
        asyncio.run(open_once())

    # All three get to open across repeated interviews.
    assert set(greetings) == set(agent.PANEL_ORDER)

    for persona, greeting in greetings.items():
        label = agent.PANEL_DEFS[persona]["label"]
        assert f"I'm the {label}" in greeting
        # ...and the other two are introduced as still to come, rather than
        # the greeting hardcoding a panel that does not match who spoke.
        for other in agent.PANEL_ORDER:
            if other == persona:
                continue
            assert agent.PANEL_DEFS[other]["label"] in greeting
        assert label not in greeting.split("I'll be joined by")[1]


def test_fallback_opener_never_splices_in_bookkeeping_as_a_topic(fake_env):
    """`action` is the panel's shorthand for what to probe, and the fallback
    templates read it as the tail of a spoken sentence. Not every action is a
    sentence tail: a restart early on carries "opening question", which
    reached a real candidate as "I want to pick up on something you just said
    — opening question." Anything that short is bookkeeping, not a topic."""
    agent = _fresh_agent_module()

    spoken = agent._build_handoff_greeting("hiring_manager", "", "opening question", 0, "Jatin Garg")
    assert "opening question" not in spoken
    assert spoken.endswith(".")

    # A real topic is still spliced in as-is.
    real = agent._build_handoff_greeting(
        "hiring_manager", "", "how the latency number was actually measured", 0, "Jatin Garg"
    )
    assert "how the latency number was actually measured" in real

    # And an orchestrator-written line always wins outright over any template.
    authored = agent._build_handoff_greeting(
        "hiring_manager", "Who made the call to ship it?", "anything at all", 0, "Jatin Garg"
    )
    assert authored == "Who made the call to ship it?"


def test_adaptive_intelligence_counts_are_derived_from_the_decision_log(fake_env):
    """Every number in the "adaptive intelligence" section must be a plain
    count of what the panel actually did — never invented for the results
    screen. This pins the arithmetic against a hand-built log."""
    agent = _fresh_agent_module()
    instance = agent.Agent()
    channel = "ch"
    instance._decision_logs[channel] = [
        {"from_interviewer": "technical_interviewer", "to_interviewer": "technical_interviewer",
         "switched": False, "decision_type": "evidence_probe", "difficulty": "medium"},
        {"from_interviewer": "technical_interviewer", "to_interviewer": "product_manager",
         "switched": True, "decision_type": "follow_up", "difficulty": "medium"},
        {"from_interviewer": "product_manager", "to_interviewer": "product_manager",
         "switched": False, "decision_type": "scenario_injection", "difficulty": "hard"},
        {"from_interviewer": "product_manager", "to_interviewer": "hiring_manager",
         "switched": True, "decision_type": "follow_up", "difficulty": "hard"},
    ]

    stats = instance._compute_adaptive_intelligence(channel)

    assert stats["questions_asked"] == 4
    assert stats["adaptive_follow_ups"] == 2
    assert stats["interviewer_switches"] == 2
    assert stats["evidence_probes"] == 1
    assert stats["scenario_challenges"] == 1
    # Difficulty changed medium->medium->hard->hard: exactly one real change.
    assert stats["difficulty_adjustments"] == 1


def test_adaptive_intelligence_is_all_zero_for_an_untouched_channel(fake_env):
    """No decisions ever logged (e.g. a call that ended in the first second)
    must read as zero, not error or fabricate a plausible-looking number."""
    agent = _fresh_agent_module()
    instance = agent.Agent()
    stats = instance._compute_adaptive_intelligence("never-started")
    assert stats == {
        "questions_asked": 0,
        "adaptive_follow_ups": 0,
        "interviewer_switches": 0,
        "difficulty_adjustments": 0,
        "evidence_probes": 0,
        "scenario_challenges": 0,
    }


def test_evidence_quality_coverage_is_computed_not_trusted_from_the_model(fake_env):
    """`coverage_pct` is derived arithmetically from the strong/weak/missing
    counts so it can never drift from the numbers displayed beside it, even
    if the model's own arithmetic (were it asked to compute a percentage)
    were off."""
    agent = _fresh_agent_module()
    instance = agent.Agent()

    quality = instance._compute_evidence_quality(
        {
            "evidence": [
                {"claim": "cut latency 800ms to 200ms", "strength": "strong"},
                {"claim": "led a team of 6", "strength": "weak"},
                {"claim": "improved conversion", "strength": "missing"},
                {"claim": "shipped the migration", "strength": "strong"},
            ],
            "contradictions": ["said team size was 6, then later said 10"],
        }
    )

    assert quality["strong_evidence_count"] == 2
    assert quality["weak_evidence_count"] == 1
    assert quality["missing_evidence_count"] == 1
    assert quality["coverage_pct"] == 50  # 2 of 4 claims strongly backed
    assert quality["contradictions_count"] == 1


def test_evidence_quality_coverage_is_none_when_no_claims_were_made(fake_env):
    """A coverage percentage of 0 would misleadingly read as "no evidence
    at all was ever backed up" when really no checkable claims existed to
    rate in the first place — these are different facts and must not
    collapse to the same number."""
    agent = _fresh_agent_module()
    instance = agent.Agent()
    quality = instance._compute_evidence_quality({"evidence": [], "contradictions": []})
    assert quality["coverage_pct"] is None
    assert quality["strong_evidence_count"] == 0


def test_evidence_quality_distinguishes_probed_from_conclusively_backed(fake_env):
    """The bug this test guards against: a screenshot showed "0% coverage"
    next to two weakly-backed claims and one never followed up on, reading
    as "the panel did nothing" when it had actually pushed on two of the
    three things claimed. `coverage_pct` (strong only) and `probed_pct`
    (strong + weak) answer different questions and must not be conflated —
    this is exactly that shape: 0 strong, 2 weak, 1 missing."""
    agent = _fresh_agent_module()
    instance = agent.Agent()

    quality = instance._compute_evidence_quality(
        {
            "evidence": [
                {"claim": "designed a daily affirmation app with glassmorphism", "strength": "weak"},
                {"claim": "developers found it too difficult in Flutter", "strength": "weak"},
                {"claim": "minimized it and used gradients instead", "strength": "missing"},
            ],
            "contradictions": [],
        }
    )

    assert quality["strong_evidence_count"] == 0
    assert quality["weak_evidence_count"] == 2
    assert quality["missing_evidence_count"] == 1
    assert quality["coverage_pct"] == 0  # true: nothing was conclusively proven
    assert quality["probed_pct"] == 67  # but 2 of 3 claims DID get followed up on


def test_evidence_quality_probed_is_none_when_no_claims_were_made(fake_env):
    """Same "no claims, not zero claims proven" distinction `coverage_pct`
    already had, extended to the new metric — an interview with nothing
    checkable in it should show as unmeasured, not as 0% probed."""
    agent = _fresh_agent_module()
    instance = agent.Agent()
    quality = instance._compute_evidence_quality({"evidence": [], "contradictions": []})
    assert quality["probed_pct"] is None


def test_evidence_quality_probed_reaches_100_only_when_nothing_was_left_unchecked(fake_env):
    """The ceiling case: every claim got at least some follow-up, none were
    left entirely unaddressed."""
    agent = _fresh_agent_module()
    instance = agent.Agent()
    quality = instance._compute_evidence_quality(
        {
            "evidence": [
                {"claim": "a", "strength": "strong"},
                {"claim": "b", "strength": "weak"},
            ],
            "contradictions": [],
        }
    )
    assert quality["probed_pct"] == 100
    assert quality["coverage_pct"] == 50


def test_get_assessment_folds_in_evidence_quality_and_adaptive_intelligence(fake_env, monkeypatch):
    """The two new sections must actually reach the payload get_assessment()
    returns — that's the only path the frontend results screen reads from."""
    agent = _fresh_agent_module()

    async def fake_assess(self, role_context, transcript, job=None):
        return {
            "overall_score": 7.5,
            "competencies": [],
            "panel_notes": [],
            "contradictions": ["x"],
            "recommendation": "ok",
            "role_fit": None,
            "evidence": [{"claim": "a", "strength": "strong"}],
            "error": False,
        }

    monkeypatch.setattr(agent.PanelAssessor, "assess", fake_assess)

    instance = agent.Agent()
    instance._transcripts["ch"] = [{"role": "user", "content": "hi", "interviewer": None}]
    instance._role_contexts["ch"] = "Position: X."
    instance._decision_logs["ch"] = [
        {"from_interviewer": "technical_interviewer", "to_interviewer": "technical_interviewer",
         "switched": False, "decision_type": "follow_up", "difficulty": "medium"},
    ]

    result = asyncio.run(instance.get_assessment("ch"))

    assert result["evidence_quality"]["strong_evidence_count"] == 1
    assert result["evidence_quality"]["contradictions_count"] == 1
    assert result["adaptive_intelligence"]["questions_asked"] == 1


def test_decision_timeline_is_ordered_and_reaches_get_assessment(fake_env, monkeypatch):
    """The line chart on the results screen reads this directly — it must be
    in the order the questions actually happened, one point per real
    decision, and it must actually be in the payload get_assessment() hands
    back."""
    agent = _fresh_agent_module()

    async def fake_assess(self, role_context, transcript, job=None):
        return {
            "overall_score": 6.0, "competencies": [], "panel_notes": [],
            "contradictions": [], "recommendation": "ok", "role_fit": None,
            "evidence": [], "error": False,
        }

    monkeypatch.setattr(agent.PanelAssessor, "assess", fake_assess)

    instance = agent.Agent()
    instance._transcripts["ch"] = [{"role": "user", "content": "hi", "interviewer": None}]
    instance._role_contexts["ch"] = "Position: X."
    instance._decision_logs["ch"] = [
        {"from_interviewer": "technical_interviewer", "to_interviewer": "technical_interviewer",
         "switched": False, "decision_type": "evidence_probe", "difficulty": "easy"},
        {"from_interviewer": "technical_interviewer", "to_interviewer": "product_manager",
         "switched": True, "decision_type": "follow_up", "difficulty": "medium"},
    ]

    result = asyncio.run(instance.get_assessment("ch"))
    timeline = result["decision_timeline"]

    assert [p["index"] for p in timeline] == [1, 2]
    assert timeline[0]["decision_type"] == "evidence_probe"
    assert timeline[1]["interviewer"] == "product_manager" and timeline[1]["switched"] is True


def test_monitor_survives_a_single_404_right_after_a_handoff(fake_env, monkeypatch):
    """The bug this guards against, seen live: a handoff completes (start()
    returns a fresh agent_id successfully), and the very next history poll
    gets a 404 from Agora — the new task's own backend indexing has not
    caught up with the fact that it exists yet, even though start() already
    confirmed it. Trusting that first 404 unconditionally tore the whole
    interview down seconds into a brand new interviewer's turn. One 404
    must not be fatal; two in a row still must be."""
    agent = _fresh_agent_module()
    monkeypatch.setenv("PANEL_POLL_INTERVAL_SECONDS", "0")

    call_count = {"n": 0}

    class FlakySession:
        async def get_history(self):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise agent.ApiError(status_code=404, body={"reason": "TaskNotFound"})
            # Recovers on the second poll — this is the realistic case this
            # fix targets: a transient blip, not a truly dead session.
            return SimpleNamespace(contents=[])

        async def stop(self):
            pass

    instance = agent.Agent()
    state = {
        "session": FlakySession(),
        "agent_id": "agent-1",
        "current_interviewer": "technical_interviewer",
        "panel_order": list(agent.PANEL_ORDER),
        "history_seen": 0,
        "history_failures": 0,
        "history_404s": 0,
        "answers_since_switch": 0,
        "turns_by_interviewer": {key: 0 for key in agent.PANEL_ORDER},
        "recent_openers": [],
        "last_switch_ts": 0.0,
        "last_switch_reason": "",
        "last_switch_action": "",
        "deliberated_through": 0,
    }
    instance._channels["ch"] = state
    instance._transcripts["ch"] = []

    async def main():
        task = asyncio.create_task(instance._monitor_panel("ch"))
        # Wait for the recovering (second) poll to actually land, rather
        # than guessing how many event-loop turns it takes to get there —
        # same deadline-polling pattern as the handoff test above.
        deadline = asyncio.get_event_loop().time() + 5
        while call_count["n"] < 2 and asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(0.01)
        # One more turn so the loop's post-success bookkeeping (resetting
        # history_404s) actually runs before we inspect it.
        await asyncio.sleep(0.01)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(main())

    assert call_count["n"] >= 2
    # Survived the first 404: the channel must still exist afterwards.
    assert "ch" in instance._channels
    assert instance._channels["ch"]["history_404s"] == 0  # reset by the recovering poll


def test_monitor_ends_the_channel_after_repeated_404s(fake_env, monkeypatch):
    """The other half: a session that is genuinely gone (404 on every poll,
    not just the first) must still end the interview — the fix adds
    tolerance for one blip, not infinite patience for a truly dead task."""
    agent = _fresh_agent_module()
    monkeypatch.setenv("PANEL_POLL_INTERVAL_SECONDS", "0")

    class DeadSession:
        async def get_history(self):
            raise agent.ApiError(status_code=404, body={"reason": "TaskNotFound"})

        async def stop(self):
            pass

    instance = agent.Agent()
    state = {
        "session": DeadSession(),
        "agent_id": "agent-1",
        "current_interviewer": "technical_interviewer",
        "panel_order": list(agent.PANEL_ORDER),
        "history_seen": 0,
        "history_failures": 0,
        "history_404s": 0,
        "answers_since_switch": 0,
        "turns_by_interviewer": {key: 0 for key in agent.PANEL_ORDER},
        "recent_openers": [],
        "last_switch_ts": 0.0,
        "last_switch_reason": "",
        "last_switch_action": "",
        "deliberated_through": 0,
    }
    instance._channels["ch"] = state
    instance._transcripts["ch"] = []

    asyncio.run(instance._monitor_panel("ch"))

    # The monitor loop returns on its own once it gives up — no cancellation
    # needed, unlike the recovering case above.
    assert "ch" not in instance._channels
