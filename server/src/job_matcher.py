# -*- coding: utf-8 -*-
"""
Job Matcher — compares candidate resume analysis against scraped job descriptions
using Gemini, calculating weighted multi-dimensional match scores, company insights,
strengths, missing skills, and actionable suggestions.
"""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import google.generativeai as genai

logger = logging.getLogger("uvicorn.error")

_MATCH_EXAMPLE = """{
  "overall_match": 91,
  "skill_match": 95,
  "experience_match": 88,
  "education_match": 100,
  "project_match": 90,
  "tech_stack_match": 92,
  "soft_skill_match": 84,
  "strengths": ["FastAPI", "MongoDB", "Docker", "REST APIs"],
  "missing_skills": ["Kubernetes", "AWS", "GCP"],
  "resume_improvements": ["Highlight any cloud deployment experience", "Add metrics to backend performance achievements"],
  "suggestions": [
    "Practice Docker containerization and basic Kubernetes pods",
    "Review REST API concurrency and database indexing",
    "Take a Backend Mock Interview on this platform",
    "Tailor your resume headline to include FastAPI and distributed systems",
    "Apply within 3 days for maximum callback probability"
  ],
  "recommendation": "You are a strong candidate. Learning Kubernetes will significantly improve your chances for this role.",
  "difficulty": "Moderate",
  "interview_probability": 82,
  "company_insights": {
    "size_estimate": "10,000+ employees",
    "interview_pattern": ["Online Assessment", "Technical Screen", "System Design", "Behavioral / Values"],
    "commonly_asked": ["REST APIs", "Concurrency & Async", "Database Optimization", "Microservices Architecture"],
    "difficulty": 4
  }
}"""


def _backfill_empty_lists(data: Dict[str, Any], resume_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Never let `strengths` or `missing_skills` reach the frontend empty.

    The prompt already asks for 3-5 strengths and 2-4 gaps, but that is a
    request, not a guarantee — a real call can come back with every
    dimension score populated and still leave one or both of these lists
    empty (observed live: a 75% match with "Skills Match 75%" etc. all
    present, but strengths/missing_skills both `[]`). An empty list here
    means the results screen falls back to its generic placeholder text
    ("General background aligns with requirements.") for a candidate who
    already told this platform their actual strengths and gaps during
    resume analysis — there's no reason to show something generic when
    something real is sitting right there in `resume_analysis`. Same
    principle as PanelAssessor never leaving a competency's evidence blank:
    fall back to real, specific data instead of an empty list, and use a
    generic line only if that data genuinely doesn't exist either."""
    strengths = data.get("strengths")
    if not isinstance(strengths, list) or not strengths:
        fallback_strengths = (resume_analysis.get("strengths") or []) + (resume_analysis.get("top_skills") or [])
        data["strengths"] = fallback_strengths[:4] or ["Relevant background for this role"]

    missing = data.get("missing_skills")
    if not isinstance(missing, list) or not missing:
        fallback_gaps = resume_analysis.get("gaps") or []
        data["missing_skills"] = fallback_gaps[:3] or ["No specific gaps surfaced from this job description"]

    return data


class JobMatcher:
    """Compares resume profile against job descriptions to produce
    comprehensive match scores and job intelligence."""

    def __init__(self, model: str, enabled: bool):
        self._enabled = enabled
        self._model = genai.GenerativeModel(model) if enabled else None

    async def match_single(self, resume_analysis: Dict[str, Any], job: Dict[str, Any]) -> Dict[str, Any]:
        """Compare candidate resume profile against a single job description."""
        if not self._enabled or self._model is None:
            return self._fallback_match(job)

        candidate_summary = resume_analysis.get("candidate_summary", "")
        exp_years = resume_analysis.get("experience_years_estimate", "Not specified")
        top_skills = ", ".join(resume_analysis.get("top_skills", []))
        strengths = ", ".join(resume_analysis.get("strengths", []))
        gaps = ", ".join(resume_analysis.get("gaps", []))

        title = job.get("title", "")
        company = job.get("company", "")
        location = job.get("location", "")
        job_type = job.get("job_type", "Full-time")
        description = job.get("description") or job.get("description_short") or title

        prompt = f"""You are an expert AI Career Advisor and Technical Recruiter.

CANDIDATE PROFILE (derived from resume):
- Summary: {candidate_summary}
- Estimated Experience: {exp_years} years
- Key Skills: {top_skills}
- Known Strengths: {strengths}
- Known Gaps: {gaps}

JOB DETAILS:
- Title: {title}
- Company: {company}
- Location: {location}
- Job Type: {job_type}
- Job Description:
{description[:3500]}

TASK:
Analyze the candidate's fit for this specific job. Calculate dimensional scores (0-100) using these weights:
- Skills Match (35% weight)
- Experience Match (20% weight)
- Project Relevance (15% weight)
- Tech Stack Match (10% weight)
- Education Match (10% weight)
- Soft Skills Match (10% weight)

Compute overall_match (0-100) based on these weights.

Also provide:
- Strengths relevant to this specific role (3-5 items) — this list must never be empty. If the fit is very strong and nothing specific stands out beyond the obvious, name the strongest 2-3 skills/experience from the candidate profile above that this job actually calls for.
- Missing skills or gaps for this role (2-4 items) — this list must never be empty either. If the candidate is an exceptionally close match, name something genuinely absent from their profile relative to the job description (a specific tool, a scale of system, a domain), even a minor one — never leave this blank.
- Resume improvements tailored to this job (2-3 items)
- Actionable suggestions for the candidate before applying (3-5 concrete steps)
- Clear verdict/recommendation (1-2 sentences)
- Difficulty rating ("Easy Apply" | "Moderate" | "Competitive" | "High Reach")
- Interview probability percentage (0-100)
- Company insights (estimated company size, typical interview stage pattern, commonly asked interview topics for this company/domain, difficulty 1-5)

Respond ONLY with a JSON object matching this exact shape:
{_MATCH_EXAMPLE}
"""

        try:
            # Run model generation in thread pool to prevent blocking async event loop
            response = await self._model.generate_content_async(
                prompt,
                generation_config={"response_mime_type": "application/json"},
            )
            data = json.loads(response.text)
            if not isinstance(data, dict) or "overall_match" not in data:
                raise ValueError("Malformed match response from model")
            return _backfill_empty_lists(data, resume_analysis)
        except Exception:
            logger.warning("Job match call failed for %s at %s; using fallback", title, company, exc_info=True)
            return self._fallback_match(job)

    async def match_multiple(
        self,
        resume_analysis: Dict[str, Any],
        jobs: Dict[str, List[Dict[str, Any]]],
        max_jobs_per_role: int = 6,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Match jobs for each role concurrently with rate limit throttling,
        and return jobs sorted by overall_match descending."""
        matched_results: Dict[str, List[Dict[str, Any]]] = {}

        # Semaphores to throttle concurrent Gemini API calls
        semaphore = asyncio.Semaphore(5)

        async def _process_job(job: Dict[str, Any]) -> Dict[str, Any]:
            async with semaphore:
                match_data = await self.match_single(resume_analysis, job)
                job_copy = dict(job)
                job_copy["match"] = match_data
                return job_copy

        for role, job_list in jobs.items():
            if not job_list:
                matched_results[role] = []
                continue

            # Limit jobs per role to avoid excessive API usage
            target_jobs = job_list[:max_jobs_per_role]
            tasks = [_process_job(j) for j in target_jobs]
            processed_jobs = await asyncio.gather(*tasks)

            # Sort jobs by overall_match descending
            processed_jobs.sort(
                key=lambda item: (item.get("match", {}).get("overall_match", 0) if item.get("match") else 0),
                reverse=True,
            )
            matched_results[role] = processed_jobs

        return matched_results

    @staticmethod
    def _fallback_match(job: Dict[str, Any]) -> Dict[str, Any]:
        """Safe fallback match data if model call fails or is disabled."""
        company = job.get("company", "Company")
        return {
            "overall_match": 75,
            "skill_match": 75,
            "experience_match": 70,
            "education_match": 80,
            "project_match": 75,
            "tech_stack_match": 75,
            "soft_skill_match": 75,
            "strengths": ["Relevant background", "Transferable technical skills"],
            "missing_skills": ["Role-specific tooling"],
            "resume_improvements": ["Highlight relevant projects matching job requirements"],
            "suggestions": [
                f"Research {company}'s tech stack and recent products",
                "Practice relevant technical and system design mock questions",
                "Update resume keywords to match job description",
            ],
            "recommendation": f"Good initial alignment for {job.get('title', 'this role')}. Review the requirements and prepare key project stories.",
            "difficulty": "Moderate",
            "interview_probability": 70,
            "company_insights": {
                "size_estimate": "Technology Company",
                "interview_pattern": ["Recruiter Screen", "Technical Interview", "Hiring Manager"],
                "commonly_asked": ["System Design", "Core Coding", "Behavioral Questions"],
                "difficulty": 3,
            },
        }
