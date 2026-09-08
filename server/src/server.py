# -*- coding: utf-8 -*-
"""
Adaptive AI Interview Panel — Agent & Token Service

HTTP APIs:
- GET  /health         -> Liveness/readiness probe
- GET  /get_config     -> Generate connection config
- POST /startAgent     -> Start the interview panel in a channel
- POST /stopAgent      -> Stop the interview panel
- GET  /panelState     -> Live snapshot of who's currently speaking and why
- POST /getAssessment  -> Evidence-linked final assessment for a finished interview
- POST /analyzeResume  -> Resume-to-role-fit analysis with a reasoning flow chart
- POST /extractJobDescription -> Read the text out of an uploaded JD file (PDF/txt)
"""
import logging
import os
import random
import time
import warnings
from typing import Any, Dict, List, Optional
from dotenv import load_dotenv

# Load environment variables from .env.local or .env
_base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_base_dir, '.env.local'), override=True)
load_dotenv(os.path.join(_base_dir, '.env'), override=True)

# Importing agora_agent.agentkit (even just this one symbol) triggers its
# package __init__ to eagerly load the TTS vendor option models (ElevenLabs,
# Cartesia, Gradium, Rime — pulled in even though we only use MurfTTS), which
# trip pydantic's own protected-namespace and class-based-config warnings on
# every import. That happens right here, before `agent` (which sets the same
# filter for its own import path) is ever reached, so the filter has to be
# installed here too — this is upstream packaging noise, not something this
# project can fix at the source. See agent.py for the matching filter used
# when agent.py is imported directly (e.g. by tests) without going through
# server.py first.
warnings.filterwarnings("ignore", module=r"pydantic(\..*)?$")

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from agora_agent.agentkit.token import generate_convo_ai_token

try:
    # Package-relative import (e.g. pytest's package-aware import of `src`).
    from .agent import Agent
    from .resume import ALLOWED_MIME_TYPES, MAX_RESUME_BYTES, ResumeAnalyzer
    from .job_matcher import JobMatcher
    from .jd_extract import ALLOWED_JD_MIME_TYPES, MAX_JD_BYTES, JobDescriptionExtractor
except ImportError:
    # `python src/server.py` (the Dockerfile CMD and `bun run dev:backend`)
    # runs this file as a top-level script, not as part of a package, so a
    # relative import raises ImportError here — fall back to an absolute
    # import, which resolves because the script's own directory is on
    # sys.path[0] in that mode.
    from agent import Agent
    from resume import ALLOWED_MIME_TYPES, MAX_RESUME_BYTES, ResumeAnalyzer
    from job_matcher import JobMatcher
    from jd_extract import ALLOWED_JD_MIME_TYPES, MAX_JD_BYTES, JobDescriptionExtractor

logger = logging.getLogger("uvicorn.error")


def _log_route_error(route: str, exc: Exception, **context) -> None:
    """Log route failures with safe request context and a traceback."""
    safe_context = {key: value for key, value in context.items() if value is not None}
    logger.exception(
        "Request failed route=%s context=%s error_type=%s error=%s",
        route,
        safe_context,
        type(exc).__name__,
        exc,
    )


def _to_http_error(exc: Exception) -> HTTPException:
    """Convert exceptions to HTTP errors without leaking internal details.

    `ValueError` is raised throughout this file (and agent.py/resume.py/etc.)
    deliberately, for bad input the caller is meant to read and act on — e.g.
    "channel_name is required". Its message passes through unchanged.

    Everything else (RuntimeError, a database driver's exception, a network
    failure, an SDK internal) is an operational failure whose message can
    contain file paths, hostnames, or third-party SDK internals that have no
    business reaching a client. Every call site logs the real exception via
    `_log_route_error` before calling this, so nothing is lost — the client
    just gets a message that doesn't hand out infrastructure details.
    """
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail="Internal error. Please try again.")

try:
    agent = Agent()
except ValueError as e:
    logger.exception(
        "Failed to initialize Agent. Check environment variables: %s", e,
    )
    agent = None

# Independent of `agent` — resume analysis only needs a Gemini key, not
# Agora credentials, so it stays available even if the interview feature
# isn't configured (and vice versa).
_resume_gemini_key = os.getenv("GEMINI_API_KEY")
resume_analyzer = ResumeAnalyzer(
    model=os.getenv("GEMINI_RESUME_MODEL", os.getenv("GEMINI_MODEL", "gemini-1.5-flash")),
    enabled=bool(_resume_gemini_key),
)
job_matcher = JobMatcher(
    model=os.getenv("GEMINI_MATCH_MODEL", os.getenv("GEMINI_MODEL", "gemini-1.5-flash")),
    enabled=bool(_resume_gemini_key),
)
jd_extractor = JobDescriptionExtractor(
    model=os.getenv("GEMINI_JD_MODEL", os.getenv("GEMINI_MODEL", "gemini-1.5-flash")),
    enabled=bool(_resume_gemini_key),
)
if _resume_gemini_key:
    import google.generativeai as genai

    genai.configure(api_key=_resume_gemini_key)
else:
    logger.warning("GEMINI_API_KEY not set — /analyzeResume and /matchJobs will return fallback responses.")


# FastAPI application
app = FastAPI(
    title="Agora Tool Calling Recipe Service",
    version="1.0.0",
    description="Agora Conversational AI with Tool Calling integration",
)

def _allowed_origins() -> list:
    """The frontend origin(s) permitted to call this backend directly.

    In this app's architecture the browser never calls this service
    cross-origin — every client request goes through the Next.js server's own
    `/api/*` routes, which proxy to `AGENT_BACKEND_URL` server-to-server (see
    `web/src/lib/backendUrl.ts`), and CORS is a browser-only mechanism that
    does not apply to that server-to-server hop. A wildcard origin here does
    nothing to help that flow — it only means any third-party website's own
    JavaScript could call these endpoints (which start paid Agora/Gemini/Murf
    sessions) directly from a visitor's browser. `CORS_ALLOWED_ORIGINS` is a
    comma-separated list for the real frontend origin(s); unset, this falls
    back to `NEXT_PUBLIC_APP_URL` (the one env var both services already
    agree names the frontend) and finally to localhost for local dev.
    """
    configured = os.getenv("CORS_ALLOWED_ORIGINS") or os.getenv("NEXT_PUBLIC_APP_URL")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return ["http://localhost:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter()


# Request models
#
# Every free-text field carries an explicit max_length. Without one, these
# were unbounded: a caller could post a multi-megabyte "job description",
# which costs nothing to send but is then held in memory per session and
# passed on to the model. The limits are set well above any genuine value
# (a long job posting is a few thousand characters) and Pydantic rejects
# anything over with a 422 before the handler runs.
MAX_JOB_DESCRIPTION_CHARS = 10_000
MAX_NAME_CHARS = 100
MAX_SHORT_TEXT_CHARS = 200
# M1-4: the job-driven fields on /startAgent. Bounds mirror
# web/src/lib/jobTypes.ts (MAX_COMPETENCIES, MAX_QUESTIONS, QUESTION_MAX) —
# a payload the frontend already validated never gets rejected here, and
# a hand-crafted one cannot smuggle anything the UI could not produce.
MAX_COMPETENCIES = 12
MAX_COMPETENCY_NAME_CHARS = 80
MAX_PANEL_SEATS = 3
MAX_MUST_ASK_QUESTIONS = 20
MAX_QUESTION_CHARS = 500


class StartAgentRequest(BaseModel):
    """Request body for POST /startAgent"""
    channelName: str = Field(max_length=MAX_SHORT_TEXT_CHARS)
    rtcUid: int
    userUid: int
    parameters: Optional[Dict[str, Any]] = None
    role: Optional[str] = Field(default=None, max_length=MAX_SHORT_TEXT_CHARS)
    company: Optional[str] = Field(default=None, max_length=MAX_SHORT_TEXT_CHARS)
    jobDescription: Optional[str] = Field(default=None, max_length=MAX_JOB_DESCRIPTION_CHARS)
    durationMinutes: Optional[int] = Field(default=None, ge=1, le=180)
    candidateName: Optional[str] = Field(default=None, max_length=MAX_NAME_CHARS)

    # --- M1-4: job-driven interview context -----------------------------
    # All optional and all absent for a practice interview, which then runs
    # on the module's own DEFAULT_JOB_CONFIG exactly as it always has. Only
    # web/app/api/candidate/start/route.ts sends these, and it reads them
    # from the job document server-side — never from the candidate's
    # browser. See that route's own comment for why that boundary matters
    # more here than anywhere else in the system.
    #
    # Each competency is `{"name": str, "weight": number}`, matching
    # web/src/lib/jobTypes.ts's Competency shape — agent.py only reads
    # `name` out of it, but accepting the whole object means this schema
    # never has to track that file's shape independently.
    competencies: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=MAX_COMPETENCIES)
    panelSeats: Optional[List[str]] = Field(default=None, max_length=MAX_PANEL_SEATS)
    mustAskQuestions: Optional[List[str]] = Field(default=None, max_length=MAX_MUST_ASK_QUESTIONS)
    hiring: bool = False

    @field_validator("competencies")
    @classmethod
    def _bound_competency_names(cls, value):
        """`Field(max_length=...)` on a list bounds the list itself, not the
        strings inside it — this is the per-item check `jobTypes.ts` already
        does client-side (Competency.name), enforced again here so a
        hand-crafted request cannot skip it."""
        if value is None:
            return value
        for entry in value:
            name = str((entry or {}).get("name") or "")
            if len(name) > MAX_COMPETENCY_NAME_CHARS:
                raise ValueError(f"Competency name must be {MAX_COMPETENCY_NAME_CHARS} characters or fewer.")
        return value

    @field_validator("mustAskQuestions")
    @classmethod
    def _bound_question_length(cls, value):
        if value is None:
            return value
        for question in value:
            if len(str(question)) > MAX_QUESTION_CHARS:
                raise ValueError(f"Each question must be {MAX_QUESTION_CHARS} characters or fewer.")
        return value


class StopAgentRequest(BaseModel):
    """Request body for POST /stopAgent"""
    agentId: Optional[str] = None
    channelName: Optional[str] = None


class GetAssessmentRequest(BaseModel):
    """Request body for POST /getAssessment"""
    channelName: str


# API endpoints
def _generate_channel_name() -> str:
    return f"tool-calling-{int(time.time())}-{random.randint(1000, 9999)}"


@router.get("/health")
async def health():
    """Liveness/readiness probe for a hosting platform or load balancer.

    Deliberately returns 200 whenever the process itself is up and able to
    answer HTTP requests, even if `agent` failed to initialise (missing Agora
    credentials) — that is a *configuration* problem the other routes already
    report clearly via their own 500s, not a "restart the container" problem.
    A platform's automated restart loop reacting to a config error would just
    restart forever without fixing anything. `configured` still surfaces that
    state for a human glancing at this endpoint.
    """
    return {
        "status": "ok",
        "agentConfigured": agent is not None,
        "geminiConfigured": bool(_resume_gemini_key),
    }


@router.get("/get_config")
async def get_config(
    channel: Optional[str] = Query(default=None),
    uid: Optional[int] = Query(default=None),
):
    """Generate connection configuration"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        user_uid = random.randint(1000, 9999999) if uid is None or uid <= 0 else uid
        agent_uid = str(random.randint(10000000, 99999999))
        channel_name = channel or _generate_channel_name()

        app_id = os.getenv("AGORA_APP_ID")
        app_certificate = os.getenv("AGORA_APP_CERTIFICATE")

        token = generate_convo_ai_token(
            app_id=app_id,
            app_certificate=app_certificate,
            channel_name=channel_name,
            uid=user_uid,
            token_expire=3600,
        )

        config_data = {
            "app_id": app_id,
            "token": token,
            "uid": str(user_uid),
            "channel_name": channel_name,
            "agent_uid": agent_uid,
        }

        return {
            "code": 0,
            "data": config_data,
            "msg": "success",
        }
    except Exception as e:
        _log_route_error("/get_config", e, channel=channel, uid=uid)
        raise _to_http_error(e)


@router.post("/startAgent")
async def start_agent(request: StartAgentRequest):
    """Start agent with tool-calling LLM in a channel"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        output_audio_codec = None
        if request.parameters:
            output_audio_codec = request.parameters.get("output_audio_codec")

        result = await agent.start(
            channel_name=request.channelName,
            agent_uid=request.rtcUid,
            user_uid=request.userUid,
            output_audio_codec=output_audio_codec,
            role=request.role or "",
            company=request.company or "",
            job_description=request.jobDescription or "",
            duration_minutes=request.durationMinutes,
            candidate_name=request.candidateName or "",
            # M1-4. All four are None/False for a practice interview
            # (nothing in the practice flow sends them), and agent.start()
            # already defaults every one of them the same way — this call
            # is unchanged for practice, just wider.
            competencies=request.competencies,
            panel_seats=request.panelSeats,
            must_ask_questions=request.mustAskQuestions,
            hiring=request.hiring,
        )
        return {"code": 0, "msg": "success", "data": result}
    except Exception as e:
        _log_route_error(
            "/startAgent",
            e,
            channelName=request.channelName,
            rtcUid=request.rtcUid,
            userUid=request.userUid,
        )
        raise _to_http_error(e)


@router.post("/stopAgent")
async def stop_agent(request: StopAgentRequest):
    """Stop agent by ID"""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        await agent.stop(agent_id=request.agentId, channel_name=request.channelName)
        return {"code": 0, "msg": "success"}
    except Exception as e:
        _log_route_error(
            "/stopAgent", e, agentId=request.agentId, channelName=request.channelName
        )
        raise _to_http_error(e)


@router.get("/panelState")
async def panel_state(channelName: str = Query(...)):
    """Live snapshot of who's currently speaking and why — polled by the
    frontend to render the panel indicator during the call."""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    state = agent.get_panel_state(channelName)
    if state is None:
        raise HTTPException(status_code=404, detail="No active interview for this channel")
    return {"code": 0, "msg": "success", "data": state}


@router.post("/getAssessment")
async def get_assessment(request: GetAssessmentRequest):
    """Evidence-linked final panel assessment for a finished interview."""
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        result = await agent.get_assessment(request.channelName)
        return {"code": 0, "msg": "success", "data": result}
    except Exception as e:
        _log_route_error("/getAssessment", e, channelName=request.channelName)
        raise _to_http_error(e)


@router.get("/sessionCost")
async def get_session_cost(channelName: str = Query(...)):
    """Usage and estimated cost for one interview (S1).

    Read after the call ends, alongside /getAssessment. Figures are estimates
    against a dated rate card — see server/src/rates.py for what is measured
    exactly and what is derived, and why. Never treat `totalUsd` as a bill.
    """
    if agent is None:
        raise HTTPException(
            status_code=500,
            detail="Service not properly configured. Please check environment variables.",
        )

    try:
        return {"code": 0, "msg": "success", "data": agent.get_session_cost(channelName)}
    except Exception as e:
        _log_route_error("/sessionCost", e, channelName=channelName)
        raise _to_http_error(e)


class ScrapeJobsRequest(BaseModel):
    roles: list[str]
    location: str = "India"
    is_internship: bool = False
    results_per_role: int = 5


@router.post("/scrapeJobs")
async def scrape_jobs_endpoint(request: ScrapeJobsRequest):
    """Scrape jobs or internships for given roles using JobSpy.
    
    Args:
        roles: List of job titles/roles to search for
        location: Location to search in (default: "India")
        is_internship: If True, searches for internships (default: False)
        results_per_role: Number of results per role (default: 5)
        
    Returns:
        Dictionary mapping role to list of job postings
    """
    try:
        from .job_scraper import scrape_multiple_roles
        
        if not request.roles:
            raise ValueError("At least one role must be provided")
        
        # Limit roles to prevent excessive scraping
        roles = request.roles[:10]
        results_per_role = min(request.results_per_role, 20)
        
        jobs = scrape_multiple_roles(
            roles=roles,
            location=request.location,
            is_internship=request.is_internship,
            results_per_role=results_per_role,
            hours_old=168,  # 1 week
        )
        
        return {"code": 0, "msg": "success", "data": jobs}
    except Exception as e:
        _log_route_error("/scrapeJobs", e, roles=request.roles, is_internship=request.is_internship)
        raise _to_http_error(e)


class ScrapeJobDescriptionRequest(BaseModel):
    job_url: str


@router.post("/scrapeJobDescription")
async def scrape_job_description_endpoint(request: ScrapeJobDescriptionRequest):
    """Full-text scrape (BeautifulSoup) of a single job posting's page.

    Used by the "Practice" flow on the Opportunities page: the bulk listing
    scrape only carries a short summary, so before grounding a practice
    interview in a specific opening, the frontend calls this to pull the
    actual posting text — the real requirements for that company and role —
    straight from the source page.
    """
    if not request.job_url or not request.job_url.strip():
        raise HTTPException(status_code=400, detail="job_url is required")

    try:
        from .job_scraper import scrape_job_description
    except ImportError:
        from job_scraper import scrape_job_description

    try:
        description = scrape_job_description(request.job_url.strip())
        return {"code": 0, "msg": "success", "data": {"description": description}}
    except Exception as e:
        _log_route_error("/scrapeJobDescription", e, job_url=request.job_url)
        raise _to_http_error(e)


@router.post("/analyzeResume")
async def analyze_resume(
    file: UploadFile = File(...),
    targetRole: str = Form(...),
):
    """Resume-to-role-fit analysis: reads the resume, evaluates fit against
    `targetRole`, and returns a reasoning flow chart plus best-suited roles."""
    if not targetRole or not targetRole.strip():
        raise HTTPException(status_code=400, detail="targetRole is required")
    # Multipart form fields bypass the Pydantic models above, so this one
    # needs its own bound — it reaches the model prompt like any other
    # free-text field.
    if len(targetRole) > MAX_SHORT_TEXT_CHARS:
        raise HTTPException(status_code=400, detail="targetRole is too long")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="Resume file is too large (max 8MB)")

    try:
        result = await resume_analyzer.analyze(data, content_type, targetRole.strip())
        return {"code": 0, "msg": "success", "data": result}
    except Exception as e:
        _log_route_error("/analyzeResume", e, targetRole=targetRole, filename=file.filename)
        raise _to_http_error(e)


@router.post("/extractJobDescription")
async def extract_job_description(file: UploadFile = File(...)):
    """Read the text out of an uploaded job-description file (PDF or plain
    text) so the org job form can offer "upload a file" instead of requiring
    the recruiter to retype or paste the listing."""
    content_type = file.content_type or ""
    if content_type not in ALLOWED_JD_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF or plain-text files are supported")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_JD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (max 8MB)")

    try:
        text = await jd_extractor.extract(data, content_type)
    except Exception as e:
        _log_route_error("/extractJobDescription", e, filename=file.filename)
        raise _to_http_error(e)

    if not text:
        raise HTTPException(status_code=422, detail="Could not find a job description in that file")

    return {"code": 0, "msg": "success", "description": text}


class MatchJobsRequest(BaseModel):
    resume_analysis: Dict[str, Any]
    jobs: Dict[str, List[Dict[str, Any]]]
    max_jobs_per_role: Optional[int] = 6


@router.post("/matchJobs")
async def match_jobs(request: MatchJobsRequest):
    """Compares candidate resume analysis against scraped job descriptions
    across 6 weighted dimensions to produce AI match scores, strengths,
    missing skills, company intelligence, and suggestions."""
    if not request.resume_analysis:
        raise HTTPException(status_code=400, detail="resume_analysis is required")
    if not request.jobs:
        return {"code": 0, "msg": "success", "data": {}}

    try:
        matched_results = await job_matcher.match_multiple(
            resume_analysis=request.resume_analysis,
            jobs=request.jobs,
            max_jobs_per_role=request.max_jobs_per_role or 6,
        )
        return {"code": 0, "msg": "success", "data": matched_results}
    except Exception as e:
        _log_route_error("/matchJobs", e)
        raise _to_http_error(e)


app.include_router(router)

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
