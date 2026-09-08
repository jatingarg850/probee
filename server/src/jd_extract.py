# -*- coding: utf-8 -*-
"""
Job-description extraction — pulls the plain text out of an uploaded JD file
via Gemini's native document understanding, the same approach `resume.py`
uses for resumes: the raw bytes go straight to the model, no separate
PDF/text-extraction library.

Deliberately just extraction, not analysis: the result lands in the job
form's own description textarea, which is validated and scored by the
existing job pipeline. This module's only job is "get the text out of the
file" — it must not decide what a good job description looks like.
"""
import logging
from typing import Optional

import google.generativeai as genai

logger = logging.getLogger("uvicorn.error")

MAX_JD_BYTES = 8 * 1024 * 1024  # 8MB, matching MAX_RESUME_BYTES
ALLOWED_JD_MIME_TYPES = {"application/pdf", "text/plain"}

# Mirrors DESCRIPTION_MAX in web/src/lib/jobTypes.ts — extracted text longer
# than what the job form accepts would just be rejected on save, so it is
# truncated here instead of surfacing a save-time error over something the
# recruiter never typed themselves.
MAX_EXTRACTED_CHARS = 10_000

_PROMPT = (
    "Extract the complete job description text from the attached document, "
    "verbatim. Return ONLY the extracted text — no preamble, no commentary, "
    "no markdown formatting, no quotation marks around it. If the document "
    "contains content other than a job description (a cover letter, an "
    "unrelated form), extract only the job-description portion. If nothing "
    "in the document resembles a job description, return an empty string."
)


class JobDescriptionExtractor:
    def __init__(self, model: str, enabled: bool):
        self._enabled = enabled
        self._model = genai.GenerativeModel(model) if enabled else None

    async def extract(self, file_bytes: bytes, mime_type: str) -> str:
        if not self._enabled or self._model is None:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        try:
            response = await self._model.generate_content_async([{"mime_type": mime_type, "data": file_bytes}, _PROMPT])
            text: Optional[str] = getattr(response, "text", None)
            return (text or "").strip()[:MAX_EXTRACTED_CHARS]
        except Exception:
            logger.warning("Job description extraction failed", exc_info=True)
            raise
