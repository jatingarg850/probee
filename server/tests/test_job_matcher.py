"""job_matcher.match_single must never hand the frontend an empty strengths
or missing_skills list — that's what showed up live as "Why You Stand Out
(0)" / "Missing / Gaps (0)" on an otherwise fully-scored 75% match, with the
UI's own generic placeholder text standing in for real data.
"""
import sys


def _fresh_job_matcher_module():
    sys.modules.pop("job_matcher", None)
    import job_matcher
    return job_matcher


class _FakeModel:
    def __init__(self, response_text):
        self._response_text = response_text

    async def generate_content_async(self, prompt, generation_config=None):
        from types import SimpleNamespace
        return SimpleNamespace(text=self._response_text)


RESUME_ANALYSIS = {
    "candidate_summary": "Backend engineer with 4 years building APIs.",
    "experience_years_estimate": 4,
    "top_skills": ["FastAPI", "PostgreSQL", "Docker"],
    "strengths": ["Strong API design", "Owns services end to end"],
    "gaps": ["Limited Kubernetes exposure"],
}

JOB = {"title": "Senior .NET Full Stack Developer", "company": "KONE", "location": "Chennai"}


def test_empty_strengths_and_missing_skills_are_backfilled_from_resume_analysis():
    """The exact bug: a well-formed response (every dimension score present)
    that returns strengths/missing_skills as empty arrays must not reach the
    caller empty — it should carry the candidate's own real strengths/gaps
    from their resume analysis instead of nothing."""
    job_matcher = _fresh_job_matcher_module()
    matcher = job_matcher.JobMatcher.__new__(job_matcher.JobMatcher)
    matcher._enabled = True
    matcher._model = _FakeModel(
        """{
            "overall_match": 75, "skill_match": 75, "experience_match": 70,
            "education_match": 85, "project_match": 75, "tech_stack_match": 80,
            "soft_skill_match": 80, "strengths": [], "missing_skills": [],
            "resume_improvements": [], "suggestions": [],
            "recommendation": "Strong candidate.", "difficulty": "Moderate",
            "interview_probability": 80,
            "company_insights": {"size_estimate": "", "interview_pattern": [], "commonly_asked": [], "difficulty": 3}
        }"""
    )

    import asyncio
    result = asyncio.run(matcher.match_single(RESUME_ANALYSIS, JOB))

    assert result["strengths"], "strengths must never be empty"
    assert result["missing_skills"], "missing_skills must never be empty"
    # Backfilled from the candidate's OWN resume analysis, not a generic line.
    assert "Strong API design" in result["strengths"]
    assert "Limited Kubernetes exposure" in result["missing_skills"]
    # Everything else the model actually returned is left untouched.
    assert result["overall_match"] == 75
    assert result["tech_stack_match"] == 80


def test_nonempty_model_lists_are_left_alone():
    """The backfill must not run at all when the model already returned real,
    role-specific content — that content is better than the resume-level
    fallback and must win."""
    job_matcher = _fresh_job_matcher_module()
    matcher = job_matcher.JobMatcher.__new__(job_matcher.JobMatcher)
    matcher._enabled = True
    matcher._model = _FakeModel(
        """{
            "overall_match": 91, "skill_match": 95, "experience_match": 88,
            "education_match": 100, "project_match": 90, "tech_stack_match": 92,
            "soft_skill_match": 84, "strengths": ["FastAPI", "MongoDB"],
            "missing_skills": ["Kubernetes"],
            "resume_improvements": [], "suggestions": [],
            "recommendation": "Great fit.", "difficulty": "Easy Apply",
            "interview_probability": 90,
            "company_insights": {"size_estimate": "", "interview_pattern": [], "commonly_asked": [], "difficulty": 2}
        }"""
    )

    import asyncio
    result = asyncio.run(matcher.match_single(RESUME_ANALYSIS, JOB))

    assert result["strengths"] == ["FastAPI", "MongoDB"]
    assert result["missing_skills"] == ["Kubernetes"]


def test_backfill_falls_back_to_a_generic_line_only_when_resume_analysis_has_nothing_either():
    """If the candidate's own resume analysis also has no strengths/gaps to
    draw on (edge case, not the common path), the result must still be a
    non-empty, honest line — never a silently empty list."""
    job_matcher = _fresh_job_matcher_module()

    empty_data = {"overall_match": 60, "strengths": [], "missing_skills": []}
    result = job_matcher._backfill_empty_lists(dict(empty_data), {"strengths": [], "top_skills": [], "gaps": []})

    assert result["strengths"] == ["Relevant background for this role"]
    assert result["missing_skills"] == ["No specific gaps surfaced from this job description"]
