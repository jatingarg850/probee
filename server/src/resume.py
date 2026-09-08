# -*- coding: utf-8 -*-
"""
Resume Analyzer — resume-to-role-fit analysis via Gemini's native document
understanding (the PDF bytes are sent directly to the model; Gemini 1.5+
parses PDF content itself, so no separate text-extraction library is
needed).

Deliberately independent of `Agent` (server/src/agent.py): it only needs a
Gemini key, not Agora credentials, so resume analysis keeps working even in
an environment where the interview feature isn't configured.
"""
import json
import logging
from typing import Any, Dict, Optional

import google.generativeai as genai

logger = logging.getLogger("uvicorn.error")

MAX_RESUME_BYTES = 8 * 1024 * 1024  # 8MB
ALLOWED_MIME_TYPES = {"application/pdf"}

# Fixed vocabulary the flow-chart renderer keys its per-type styling off of.
FLOW_NODE_TYPES = {"input", "skill", "experience", "decision", "role"}

_FLOW_EXAMPLE = """{
  "nodes": [
    {"id": "resume", "type": "input", "label": "Your Resume", "detail": "3 years experience, B.S. Computer Science"},
    {"id": "skill_backend", "type": "skill", "label": "Backend Development", "detail": "Node.js, PostgreSQL, REST APIs across 2 roles"},
    {"id": "skill_cloud", "type": "skill", "label": "Cloud Infrastructure", "detail": "AWS (EC2, S3, Lambda) at most recent role"},
    {"id": "exp_level", "type": "experience", "label": "Mid-Level (3 yrs)", "detail": "Progressed from junior to mid-level backend engineer"},
    {"id": "fit_decision", "type": "decision", "label": "Fit for \\"Senior Backend Engineer\\"?", "detail": "Strong technical base, but seniority signals (mentoring, system design ownership) are thin"},
    {"id": "role_primary", "type": "role", "label": "Backend Engineer II", "detail": "Best match: technical depth is there, title should track experience level"},
    {"id": "role_alt", "type": "role", "label": "Platform Engineer", "detail": "Alternative: cloud infra experience transfers well"}
  ],
  "edges": [
    {"from": "resume", "to": "skill_backend", "label": ""},
    {"from": "resume", "to": "skill_cloud", "label": ""},
    {"from": "skill_backend", "to": "exp_level", "label": ""},
    {"from": "skill_cloud", "to": "exp_level", "label": ""},
    {"from": "exp_level", "to": "fit_decision", "label": ""},
    {"from": "fit_decision", "to": "role_primary", "label": "closer match"},
    {"from": "fit_decision", "to": "role_alt", "label": "also consider"}
  ]
}"""


class ResumeAnalyzer:
    """Resume -> target-role fit, best-suited roles, and an explanatory
    flow chart (nodes/edges), all grounded in what the resume actually
    shows rather than generic career advice."""

    def __init__(self, model: str, enabled: bool):
        self._enabled = enabled
        self._model = genai.GenerativeModel(model) if enabled else None

    async def analyze(self, resume_bytes: bytes, mime_type: str, target_role: str) -> Dict[str, Any]:
        if not self._enabled or self._model is None:
            return self._fallback("GEMINI_API_KEY is not configured.")

        prompt = f"""You are a career analyst reviewing a candidate's resume (attached as a PDF). The candidate is targeting this role: "{target_role}".

Before anything else, check the two inputs themselves:
1. Is the attached file actually a real, readable resume/CV — does it contain a person's work history, education, or skills? (Not: a blank page, a corrupted/unreadable file, an unrelated document like an invoice or a photo, or text with no discernible resume content.)
2. Is "{target_role}" a plausible job title or career direction? (Not: empty, random keyboard mashing, or something that isn't a real occupation.)

Read the resume carefully and respond with ONLY a JSON object matching this shape exactly:
{{
  "resume_readable": boolean (false ONLY if check 1 above fails),
  "target_role_valid": boolean (false ONLY if check 2 above fails),
  "validation_message": string (if either flag above is false, one short, friendly sentence explaining what's wrong and what to do instead; otherwise an empty string),
  "candidate_summary": string (2-3 sentences, grounded in the resume),
  "target_role": string (echo back "{target_role}"),
  "target_role_fit": {{
    "verdict": "strong" | "moderate" | "weak",
    "score": number 0-10,
    "reasoning": string (specific to what is/isn't in the resume, 1-3 sentences)
  }},
  "experience_years_estimate": number or null,
  "top_skills": [string] (5-10 skills actually evidenced in the resume, most relevant first),
  "strengths": [string] (2-5 items, each grounded in a specific resume detail),
  "gaps": [string] (1-5 items — what's missing or weak for the target role; empty array if genuinely none),
  "best_suitable_roles": [
    {{"role": string, "match_score": number 0-100, "reasoning": string}}
  ] (2-4 roles ranked by fit, computed from the ACTUAL skills/experience shown — if the target role itself is the best fit, it should rank first; otherwise lead with what fits best),
  "flow": {{
    "nodes": [
      {{"id": string (short, unique, snake_case), "type": "input" | "skill" | "experience" | "decision" | "role", "label": string (short, <=6 words), "detail": string (1 sentence, shown on click)}}
    ],
    "edges": [
      {{"from": string (node id), "to": string (node id), "label": string (short or empty)}}
    ]
  }}
}}

The "flow" must be a directed acyclic graph that visually explains the reasoning: exactly one "input" node (the resume itself), several "skill" and/or "experience" nodes derived from what's actually on the resume, converging into exactly one "decision" node (the target-role fit call), branching into 2-4 "role" nodes (best_suitable_roles, same order). Every node must be reachable from the input node and every non-role node must have at least one outgoing edge. Keep it to 6-10 nodes total — a reasoning map, not an exhaustive resume dump. Example shape (content is illustrative only, do not reuse it):
{_FLOW_EXAMPLE}

Ground every field in what the resume actually contains — do not invent experience, skills, or education that isn't there. If the resume is sparse, say so in candidate_summary and keep gaps honest rather than padding strengths.

If resume_readable or target_role_valid is false, you may leave every other field at a reasonable empty/placeholder value (empty arrays, null, zero) — do not fabricate an analysis for input that fails either check."""

        try:
            response = await self._model.generate_content_async(
                [{"mime_type": mime_type, "data": resume_bytes}, prompt],
                generation_config={"response_mime_type": "application/json"},
            )
            data = json.loads(response.text)
            if not isinstance(data, dict) or "flow" not in data or "best_suitable_roles" not in data:
                raise ValueError("malformed resume analysis response")

            # Guardrail: a resume that isn't actually readable, or a target
            # role that isn't a real job title/career, produces a fabricated
            # analysis rather than useful signal — surface it as the same
            # error/error_message the client already knows how to render
            # instead of pretending the input was fine.
            if data.get("resume_readable") is False:
                return self._fallback(
                    data.get("validation_message")
                    or "We couldn't read this as a resume. Please upload a clear PDF of your actual resume or CV.",
                    error_type="validation",
                )
            if data.get("target_role_valid") is False:
                return self._fallback(
                    data.get("validation_message")
                    or f'"{target_role}" doesn\'t look like a real job title — try something like "Backend Engineer" or "Product Manager".',
                    error_type="validation",
                )

            self._validate_flow(data.get("flow"))
            data["error"] = False
            return data
        except Exception:
            logger.warning("Resume analysis call failed; using fallback", exc_info=True)
            return self._fallback("The analysis model call failed.")

    @staticmethod
    def _validate_flow(flow: Optional[Dict[str, Any]]) -> None:
        """Best-effort structural check so a malformed graph fails fast into
        the fallback path instead of reaching the client and breaking the
        flow-chart renderer. Not exhaustive — the renderer itself also
        tolerates a dangling edge or two."""
        if not isinstance(flow, dict):
            raise ValueError("flow missing")
        nodes = flow.get("nodes")
        edges = flow.get("edges")
        if not isinstance(nodes, list) or not nodes or not isinstance(edges, list):
            raise ValueError("flow.nodes/edges missing or empty")
        node_ids = set()
        for node in nodes:
            if not isinstance(node, dict) or "id" not in node or "type" not in node:
                raise ValueError("malformed flow node")
            node_ids.add(node["id"])
        for edge in edges:
            if not isinstance(edge, dict) or "from" not in edge or "to" not in edge:
                raise ValueError("malformed flow edge")

    @staticmethod
    def _fallback(note: str, error_type: str = "system") -> Dict[str, Any]:
        return {
            "candidate_summary": "",
            "target_role": "",
            "target_role_fit": {"verdict": "weak", "score": 0, "reasoning": note},
            "experience_years_estimate": None,
            "top_skills": [],
            "strengths": [],
            "gaps": [],
            "best_suitable_roles": [],
            "flow": {"nodes": [], "edges": []},
            "error": True,
            "error_message": note,
            # 'validation': the input itself was the problem (unreadable
            # resume, nonsense target role) — worth surfacing to the user to
            # fix. 'system': a transient failure on the analysis call
            # (model API hiccup, malformed response) — safe to treat as
            # non-fatal by callers that have a fallback path.
            "error_type": error_type,
        }
