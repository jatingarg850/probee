# PROJECT_UNDERSTANDING.md — PROBE (Knotic)

> **Complete codebase onboarding document** — written as if by a senior architect for a new engineer joining the team.

---

# 1. Project Overview

## What Problem Does This Solve?

**PROBE** is an AI-powered mock interview platform. It simulates a **panel interview** with three AI interviewers (Technical Interviewer, Product Manager, Hiring Manager) who share a single live voice conversation with a human candidate. The interviewers take turns asking questions based on the conversation so far — not from a fixed script — and hand off the floor to each other dynamically based on what competency should be probed next.

Beyond the live interview, PROBE also offers:
- **Resume Analysis** — Upload a PDF, get a Gemini-powered fit-against-role evaluation with a visual reasoning flow chart.
- **Job/Internship Opportunities** — Scrape live job listings from LinkedIn based on roles the resume analysis recommends.
- **Proctoring** — Client-side face/gaze tracking, fullscreen lockdown, and tab-switch detection during the interview.
- **Assessment** — After an interview ends, a Gemini call produces an evidence-linked, per-competency scorecard.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (web/)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌────────┐  │
│  │ React UI │  │ Agora RTC/RTM│  │ Three.js  │  │MediaPipe│  │
│  │ Tailwind │  │ Client SDKs  │  │3D Avatars │  │FaceGaze │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └────┬───┘  │
│       │               │                │              │      │
│  ┌────┴───────────────┴────────────────┴──────────────┴───┐  │
│  │              Next.js API Routes (auth, chat, jobs)      │  │
│  └────────────────────────────┬────────────────────────────┘  │
└───────────────────────────────┼───────────────────────────────┘
                                │
                   ┌────────────┼────────────┐
                   │    Python Backend       │
                   │  ┌─────────────────┐    │
                   │  │   FastAPI       │    │
                   │  │   Server        │    │
                   │  └──┬──────┬───┬───┘    │
                   │     │      │   │        │
                   │  ┌──┴──┐┌──┴┐┌─┴──┐     │
                   │  │Agent││Resume│Job │    │
                   │  │Orch.││Anal.││Scr.│    │
                   │  └──┬──┘└──┬─┘└─┬──┘    │
                   └─────┼──────┼────┼───────┘
                         │      │    │
           ┌─────────────┼──────┼────┼─────────────┐
           │         External Services              │
           │  Agora Cloud  │  Gemini  │  Murf TTS   │
           │  Deepgram STT │  MongoDB │  LinkedIn   │
           └────────────────────────────────────────┘
```

## Technologies Used

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 16 (App Router), React 19 |
| **Styling** | Tailwind CSS 3 |
| **3D Rendering** | Three.js, React Three Fiber, React Three Drei |
| **Real-Time Comms** | Agora RTC SDK, Agora RTM SDK, Agora Voice AI Client Toolkit |
| **Face Detection** | MediaPipe FaceLandmarker (WASM, client-side) |
| **Backend Framework** | Python FastAPI + Uvicorn |
| **LLM** | Google Gemini (via `google-generativeai`) |
| **TTS** | Murf AI (via `agora-agents` SDK) |
| **STT** | Deepgram Nova 3 (via `agora-agents` SDK) |
| **Database** | MongoDB Atlas (`knotic-chat` database) |
| **Job Scraping** | `python-jobspy` (LinkedIn) |
| **Auth** | JWT + bcrypt, stored in MongoDB |
| **Linting** | Biome |
| **Package Manager** | Bun (frontend), pip/uv (backend) |
| **Deployment** | Docker (Dockerfile present) |

---

# 2. Folder Structure

```
Knotic/
├── server/                     # Python backend
│   ├── src/
│   │   ├── __init__.py
│   │   ├── server.py           # FastAPI app & route handlers
│   │   ├── agent.py            # Panel orchestrator, Agent class, Agora integration
│   │   ├── resume.py           # Resume analyzer (Gemini)
│   │   └── job_scraper.py      # LinkedIn job scraper (JobSpy)
│   ├── scripts/
│   │   └── run_fake_server.py  # Fake server for frontend-only testing
│   ├── tests/                  # Pytest test suite
│   ├── .env.local              # Backend secrets & config
│   └── requirements.txt        # Python dependencies
│
├── web/                        # Next.js frontend
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── layout.tsx          # Root layout (AuthProvider, AppShell)
│   │   ├── page.tsx            # Dashboard (home page)
│   │   ├── interview/          # Live interview page
│   │   ├── interviews/         # Interview history listing
│   │   ├── sessions/           # Past session viewer
│   │   ├── resume/             # Resume analyzer page
│   │   ├── opportunities/      # Job opportunity listings
│   │   ├── questions/          # Practice questions page
│   │   ├── login/              # Login page
│   │   └── api/                # Next.js server-side API routes
│   │       ├── auth/           # register, login, verify, profile
│   │       ├── chat/           # messages & sessions (MongoDB CRUD)
│   │       └── jobs/           # Proxy to Python scraper
│   ├── src/
│   │   ├── components/         # 29 React components + ui/ subdirectory
│   │   ├── contexts/           # AuthContext (React context)
│   │   ├── hooks/              # 7 custom React hooks
│   │   ├── lib/                # 12 utility/library modules
│   │   ├── services/           # api.ts (frontend HTTP client)
│   │   └── types/              # TypeScript type definitions
│   ├── public/                 # Static assets (favicons, 3D models, SVGs)
│   ├── scripts/                # Verification & diagnostic scripts
│   ├── .env.local              # Frontend secrets & config
│   ├── next.config.ts          # Next.js config (API rewrites)
│   ├── tailwind.config.js      # Tailwind theme
│   └── package.json            # Frontend dependencies
│
├── Dockerfile                  # Docker image for Python backend
├── package.json                # Root workspace config
├── START_LOCAL.ps1             # PowerShell script to start everything
└── *.md                        # Documentation files
```

### Folder Purposes

| Folder | Purpose | Connects To |
|---|---|---|
| `server/src/` | Core backend logic — API routes, interview orchestration, resume analysis, job scraping | Agora Cloud, Gemini API, Murf TTS |
| `server/tests/` | Backend unit tests (pytest) — panel switching, agent construction, LLM mounts | `server/src/` |
| `web/app/` | Next.js page routes (file-system routing) and server-side API routes | `web/src/`, MongoDB |
| `web/src/components/` | All React UI components — interview UI, dashboard, assessment charts, proctoring overlay, 3D avatar stage | `web/src/hooks/`, `web/src/lib/` |
| `web/src/hooks/` | Custom React hooks — face/gaze monitoring, proctoring strikes, lockdown, panel state polling | MediaPipe, Browser APIs |
| `web/src/lib/` | Shared utilities — conversation normalization, avatar animations, viseme scheduling, MongoDB chat persistence, flow chart layout | `web/src/components/` |
| `web/src/services/` | HTTP client layer — wraps `fetch` calls to the backend API | `server/src/server.py` (via Next.js rewrites) |
| `web/src/types/` | TypeScript interfaces for conversation, resume, and session data | Used across `components/`, `services/`, `lib/` |
| `web/public/models/` | 3D `.glb` avatar models (male, female, hiring manager) | `PanelAvatarStage.tsx` |

---

# 3. Entry Points

## Backend Entry Point

**File:** `server/src/server.py`

**Startup command:**
```bash
python -m uvicorn src.server:app --reload --port 8000
```

**Initialization flow:**

1. **Environment loading** (lines 22-24): Loads `server/.env.local` then `server/.env` via `python-dotenv`.
2. **Warning suppression** (line 36): Silences pydantic warnings from Agora SDK's vendor TTS models.
3. **Imports** (lines 38-54): Imports FastAPI, Agora token generator, `Agent`, and `ResumeAnalyzer`. Uses a try/except for relative vs absolute imports (supports both `python -m` and direct execution).
4. **Agent initialization** (lines 79-85): Instantiates `Agent()`, which validates Agora + Gemini + Murf credentials and creates the `AsyncAgora` client. If credentials are missing, `agent` is set to `None` and routes return 500.
5. **Resume analyzer initialization** (lines 90-100): Instantiates `ResumeAnalyzer` independently of `Agent` (only needs Gemini key). Configures `genai` globally if available.
6. **FastAPI app creation** (lines 104-116): Creates the app, adds CORS middleware allowing all origins.
7. **Router registration** (line 358): Mounts all endpoint handlers.

## Frontend Entry Point

**File:** `web/app/layout.tsx` → `web/app/page.tsx`

**Startup command:**
```bash
cd web && bun run dev
```

**Initialization flow:**

1. `layout.tsx` loads the Instrument Sans Google Font, wraps children in `<AuthProvider>` → `<AppShell>`.
2. `AppShell` checks authentication state — if not logged in, renders `<LoginForm>` instead of page content.
3. `page.tsx` renders `<Dashboard>`, which fetches the user's past interview sessions from MongoDB.
4. The sidebar (`Sidebar.tsx`) provides navigation to all pages.

---

# 4. Complete Code Flow

## Flow 1: Live Panel Interview

```
Candidate fills interview setup form (role, company, JD)
    ↓
InterviewPrecheck (camera, fullscreen verification)
    ↓
Frontend: GET /get_config → {app_id, token, channel_name, uid}
    ↓
Frontend: POST /startAgent {channelName, role, company...}
    ↓
Backend: Creates Agora agent session (STT→LLM→TTS pipeline)
         Starts _monitor_panel() async loop
    ↓
Frontend: Joins RTC channel + RTM subscribe
    ↓
Candidate speaks → Agora → Deepgram STT → transcript
    ↓
Transcript → Gemini LLM → response text → Murf TTS → audio → Candidate hears
    ↓
Every 3 seconds (monitor loop):
    Backend fetches history → appends to shared transcript
    Gemini Orchestrator decides: keep current or switch interviewer?
    If switch: stop session → build new with new voice → start
    ↓
Candidate ends call → POST /stopAgent
    ↓
Frontend: POST /getAssessment
    ↓
Backend: Full transcript → Gemini Assessor → competency scores
    ↓
Frontend shows AssessmentResults page
    ↓
Session + assessment saved to MongoDB
```

## Flow 2: Resume Analysis

```
User uploads PDF + enters target role
    ↓
Frontend (ResumeAnalyzerPage.tsx)
    ↓
POST /api/analyzeResume (Next.js rewrite → FastAPI)
    ↓
server/src/server.py → resume_analyzer.analyze()
    ↓
server/src/resume.py → Gemini model (PDF bytes + prompt)
    ↓
JSON response: {candidate_summary, target_role_fit, top_skills, best_suitable_roles, flow: {nodes, edges}}
    ↓
Frontend renders FlowChart (SVG DAG) + score rings + role cards
```

## Flow 3: Job Opportunities

```
User visits /opportunities page
    ↓
Frontend loads cached resume analysis from localStorage
    ↓
Extracts best_suitable_roles from analysis
    ↓
POST /api/jobs/scrape (Next.js API route)
    ↓
Proxies to FastAPI POST /scrapeJobs
    ↓
server/src/job_scraper.py → python-jobspy → LinkedIn scrape
    ↓
Returns {role: [{title, company, location, job_url, ...}]}
    ↓
Frontend renders job cards grouped by role
```

---

# 5. Module-by-Module Explanation

## Backend Modules

### `server/src/server.py` (365 lines)

**Purpose:** FastAPI application — all HTTP endpoints, request/response models, and initialization.

**Responsibilities:**
- Load environment variables
- Initialize `Agent` and `ResumeAnalyzer` singletons
- Define API endpoints and request validation models
- Convert internal exceptions to HTTP errors
- CORS middleware

**Key Classes:**
- `StartAgentRequest` — Pydantic model for `/startAgent` body
- `StopAgentRequest` — Pydantic model for `/stopAgent` body
- `GetAssessmentRequest` — Pydantic model for `/getAssessment` body
- `ScrapeJobsRequest` — Pydantic model for `/scrapeJobs` body

**Dependencies:** FastAPI, Agora token generator, Agent, ResumeAnalyzer, python-dotenv

---

### `server/src/agent.py` (874 lines)

**Purpose:** The core of the system — manages the panel of AI interviewers, orchestrates handoffs between them, and scores interviews.

**Key Classes:**

| Class | Responsibility |
|---|---|
| `PanelOrchestrator` | Backend-side Gemini call that reads the shared transcript and decides which interviewer should speak next |
| `PanelAssessor` | End-of-interview Gemini call that produces evidence-linked competency scores |
| `Agent` | Main class — manages Agora sessions, panel state, transcript history, and the monitor loop |

**Important Functions:**

| Function | What It Does |
|---|---|
| `Agent.start()` | Starts a panel interview: builds the first interviewer's STT/LLM/TTS pipeline, creates an Agora session, and launches the monitor loop |
| `Agent._monitor_panel()` | Async loop (runs every 3s): fetches conversation history, appends to transcript, asks orchestrator for handoff decisions |
| `Agent._switch_interviewer()` | Stops the current Agora session, builds a new one with the next interviewer's voice and context, and starts it |
| `Agent.get_assessment()` | Calls `PanelAssessor.assess()` with the full transcript; caches the result per channel |
| `Agent.stop()` | Gracefully stops the interview: cancels the monitor task, captures final transcript, stops the Agora session |
| `_build_role_context()` | Formats position/company/JD/duration into a context string for prompts |
| `_build_switch_instructions()` | Constructs handoff instructions so the new interviewer continues naturally |
| `_format_transcript()` | Converts internal transcript entries into a human-readable prompt format |

**State Management (in-memory dictionaries):**

| Dict | Key | Purpose |
|---|---|---|
| `_sessions` | agent_id | Maps agent IDs to Agora session objects |
| `_channels` | channel_name | Live interview state (agent_id, current interviewer, history cursor, monitor task) |
| `_transcripts` | channel_name | Shared conversation transcript stitched across handoffs |
| `_role_contexts` | channel_name | Role/company/JD context string, persisted for post-interview scoring |
| `_assessments` | channel_name | Cached final assessment results |

---

### `server/src/resume.py` (145 lines)

**Purpose:** Resume-to-role-fit analysis. Sends PDF bytes directly to Gemini (no separate text extraction needed) and gets back a structured JSON with skills, gaps, best-suited roles, and a reasoning flow chart.

**Key Class: `ResumeAnalyzer`**

| Method | What It Does |
|---|---|
| `analyze(resume_bytes, mime_type, target_role)` | Sends the PDF + structured prompt to Gemini; parses and validates the JSON response |
| `_validate_flow(flow)` | Structural check on the flow chart graph (nodes have ids/types, edges have from/to) |
| `_fallback(note)` | Returns a safe empty-state response when the model call fails |

**Constants:**
- `MAX_RESUME_BYTES` = 8MB
- `ALLOWED_MIME_TYPES` = `{"application/pdf"}`
- `FLOW_NODE_TYPES` = `{input, skill, experience, decision, role}`

---

### `server/src/job_scraper.py` (113 lines)

**Purpose:** Scrapes job/internship listings from LinkedIn using the `python-jobspy` library.

**Key Functions:**

| Function | What It Does |
|---|---|
| `scrape_jobs_by_role(role, location, ...)` | Scrapes LinkedIn for a single role; converts DataFrame rows to clean dicts |
| `scrape_multiple_roles(roles, ...)` | Iterates over multiple roles, aggregates results into `{role: [jobs]}` |

---

## Frontend Modules

### Key Components

| Component | File | Purpose |
|---|---|---|
| `Dashboard` | `Dashboard.tsx` | Home page — stats cards, recent interview list, session detail pane with assessment |
| `InterviewFlow` | `InterviewFlow.tsx` | Orchestrates the entire interview lifecycle: setup → precheck → conversation → assessment/rejected |
| `InterviewSetupForm` | `InterviewSetupForm.tsx` | Form for role, company, JD, duration, candidate name |
| `InterviewPrecheck` | `InterviewPrecheck.tsx` | Camera/fullscreen gate before joining the call |
| `ConversationComponent` | `ConversationComponent.tsx` | The live call: Agora RTC/RTM, transcript rendering, lip-sync scheduling, MongoDB persistence |
| `PanelAvatarStage` | `PanelAvatarStage.tsx` | Three.js 3D scene — renders the active interviewer's avatar with lip-sync and idle animations |
| `ProctoringOverlay` | `ProctoringOverlay.tsx` | Draggable self-view camera PiP, strike warnings, fullscreen nudge, gaze-away progress bar |
| `AssessmentResults` | `AssessmentResults.tsx` | Post-interview scorecard display |
| `AssessmentBreakdown` | `AssessmentBreakdown.tsx` | Detailed per-competency scores, panel notes, strengths/weaknesses, evidence |
| `AssessmentCharts` | `AssessmentCharts.tsx` | SVG ring/bar charts for scores |
| `FlowChart` | `FlowChart.tsx` | Interactive SVG DAG — resume → skills → fit decision → role recommendations |
| `ResumeAnalyzerPage` | `ResumeAnalyzerPage.tsx` | Upload PDF, select target role, see analysis results with flow chart |
| `OpportunitiesPage` | `OpportunitiesPage.tsx` | Fetches jobs from scraper based on resume analysis roles |
| `LoginForm` | `LoginForm.tsx` | Email/password login + registration toggle |
| `Sidebar` | `Sidebar.tsx` | Fixed left sidebar with navigation links |
| `AppShell` | `AppShell.tsx` | Layout wrapper — renders sidebar + content, or login form if unauthenticated |
| `PanelIndicator` | `PanelIndicator.tsx` | Shows which interviewer is currently speaking and why |

### Key Hooks

| Hook | File | Purpose |
|---|---|---|
| `useFaceGazeMonitor` | `useFaceGazeMonitor.ts` | Webcam + MediaPipe FaceLandmarker: face detection, iris-based gaze tracking, head-yaw estimation, eye-open/closed blendshapes. Runs entirely client-side — no frames leave the browser. |
| `useProctoringStrikes` | `useProctoringStrikes.ts` | Strike system: 6 violation types (gaze_away, no_face, multiple_faces, tab_switch, fullscreen_exit, devtools); 3 strikes → auto-rejection with cooldown and grace period. |
| `useInterviewLockdown` | `useInterviewLockdown.ts` | Requests fullscreen, detects fullscreen exit, detects developer tools open via window size heuristic. |
| `useTabHidden` | `useTabHidden.ts` | Detects when the user switches tabs (Page Visibility API). |
| `usePanelState` | `usePanelState.ts` | Polls `GET /panelState` every few seconds to get the current active interviewer. |
| `useDraggable` | `useDraggable.ts` | Makes the self-view camera PiP draggable around the screen. |
| `useCameraPreviewRef` | `useCameraPreviewRef.ts` | Attaches a `MediaStream` to a `<video>` element ref. |

### Key Libraries

| Module | File | Purpose |
|---|---|---|
| `conversation.ts` | `conversation.ts` | Normalizes transcripts, maps Agora agent states to visualizer states, builds message lists with per-turn speaker attribution. |
| `mongoChat.ts` | `mongoChat.ts` | Client-side wrappers for the `/api/chat/*` routes — save/fetch messages, sessions, assessments to MongoDB. |
| `panelAvatars.ts` | `panelAvatars.ts` | Panel avatar definitions — maps each interviewer to a `.glb` model URL, accent color, and voice name. |
| `avatarAnimations.ts` | `avatarAnimations.ts` | Three.js avatar animation system — phoneme-to-jaw mapping, hand positioning, body language. |
| `textToVisemes.ts` | `textToVisemes.ts` | Maps text characters to Oculus/ARKit viseme shapes (15 visemes) + jaw-open amounts for lip-sync. |
| `visemeScheduler.ts` | `visemeScheduler.ts` | Word-queue-driven lip-sync scheduler — words pushed in from transcript events, consumed frame-by-frame by the 3D avatar renderer. |
| `flowLayout.ts` | `flowLayout.ts` | Automatic graph layout algorithm for the resume analysis flow chart (node positioning by layer). |
| `scoreColor.ts` | `scoreColor.ts` | Maps numeric scores to color gradients (red → yellow → green). |
| `resumeAnalysisCache.ts` | `resumeAnalysisCache.ts` | localStorage cache for resume analysis results (used by Opportunities page). |

---

# 6. Function Documentation

## Backend — Critical Functions

### `PanelOrchestrator.decide(role_context, current_interviewer, transcript)`
- **What:** Sends the current transcript + context to Gemini and asks which interviewer should speak next.
- **Parameters:** Role context string, current interviewer ID, full transcript list.
- **Returns:** `{next_interviewer, action, reason, difficulty, explicit_request}` or `None`.
- **Side Effects:** Makes a synchronous Gemini API call on a thread.
- **Logic:** Constructs a detailed prompt with rules (honor explicit requests, prefer keeping current interviewer, require at least one candidate turn). Forces JSON-only response via `response_mime_type`.

### `Agent._monitor_panel(channel_name)`
- **What:** Async background loop that polls the Agora conversation history, appends new messages to the shared transcript, and triggers handoffs.
- **Parameters:** Channel name string.
- **Logic:**
  1. Sleep for `POLL_INTERVAL_SECONDS` (default 3s).
  2. Fetch history from Agora session.
  3. Append new messages to `_transcripts[channel]`.
  4. If there's at least one candidate turn, call `orchestrator.decide()`.
  5. If the decision says to switch and enough time has passed (`MIN_SECONDS_BETWEEN_SWITCHES`), call `_switch_interviewer()`.
  6. If history fetch returns 404 (session gone), clean up the channel.
  7. After 5 consecutive non-404 fetch failures, give up.

### `Agent._switch_interviewer(channel_name, persona, decision)`
- **What:** Restarts the Agora session under a different interviewer's voice.
- **Logic:**
  1. Stop the old session.
  2. Build handoff instructions (recent transcript recap + what to probe next).
  3. Create a new `AgoraAgent` with the new interviewer's TTS voice.
  4. Start the new session on the same channel with the same UIDs.
  5. Update all state dictionaries.

### `ResumeAnalyzer.analyze(resume_bytes, mime_type, target_role)`
- **What:** Sends a PDF resume directly to Gemini for analysis.
- **Logic:** Constructs a prompt that requests a specific JSON shape (candidate summary, role fit verdict, skills, gaps, best roles, and a DAG-structured flow chart). Validates the flow chart structure before returning. Falls back to an error response if anything fails.

## Frontend — Critical Functions

### `InterviewFlow.handleStartConversation(setup)`
- **What:** Full startup sequence for a live interview.
- **Logic:**
  1. `getConfig()` — fetches Agora credentials and channel from backend.
  2. `startAgent()` — tells backend to start the AI panel.
  3. Creates RTM client, logs in, subscribes to channel with presence retry.
  4. Sets `agoraData` and transitions to `'conversation'` view.

### `ConversationComponent` — TRANSCRIPT_UPDATED handler
- **What:** Processes every transcript update from the Agora Voice AI SDK.
- **Logic:**
  1. Locks each turn's speaker to whichever interviewer was active when the turn first appeared (prevents label drift after handoffs).
  2. Saves completed messages to MongoDB.
  3. Extracts new words and pushes them into the `VisemeScheduler` for lip-sync.

---

# 7. Classes

## `Agent` (agent.py)

| Aspect | Detail |
|---|---|
| **Responsibility** | Manages the full lifecycle of panel interviews — start, monitor, handoff, stop, assess |
| **Public Methods** | `start()`, `stop()`, `get_panel_state()`, `get_assessment()` |
| **Internal State** | `_sessions`, `_channels`, `_transcripts`, `_role_contexts`, `_assessments` (all in-memory dicts keyed by agent_id or channel_name) |
| **Design Pattern** | Facade — wraps Agora SDK, Gemini orchestrator, and Gemini assessor behind a simple start/stop/assess interface |

## `PanelOrchestrator` (agent.py)

| Aspect | Detail |
|---|---|
| **Responsibility** | Decides which interviewer should speak next |
| **Public Methods** | `decide(role_context, current_interviewer, transcript)` |
| **Design Pattern** | Strategy — the decision logic is encapsulated behind a single `decide()` call that returns a structured decision |

## `PanelAssessor` (agent.py)

| Aspect | Detail |
|---|---|
| **Responsibility** | Produces end-of-interview competency scores and role-fit analysis |
| **Public Methods** | `assess(role_context, transcript)` |
| **Relationship** | Called by `Agent.get_assessment()` |

## `ResumeAnalyzer` (resume.py)

| Aspect | Detail |
|---|---|
| **Responsibility** | Analyzes PDF resumes against target roles using Gemini |
| **Public Methods** | `analyze(resume_bytes, mime_type, target_role)` |
| **Design Pattern** | Independent service — deliberately decoupled from `Agent` (only needs Gemini key, not Agora credentials) |

---

# 8. API Documentation

## Backend (FastAPI) Endpoints

### `GET /get_config`
Generates Agora connection credentials for a new session.

| Param | Type | Required | Description |
|---|---|---|---|
| `channel` | string (query) | No | Custom channel name; auto-generated if omitted |
| `uid` | int (query) | No | User UID; random if omitted |

**Response:** `{code: 0, data: {app_id, token, uid, channel_name, agent_uid}}`

---

### `POST /startAgent`
Starts the AI interview panel on a channel.

| Field | Type | Required | Description |
|---|---|---|---|
| `channelName` | string | Yes | Agora channel |
| `rtcUid` | int | Yes | Agent's RTC UID |
| `userUid` | int | Yes | Candidate's RTC UID |
| `role` | string | No | Job role being interviewed for |
| `company` | string | No | Company name |
| `jobDescription` | string | No | Job description (truncated to 1200 chars) |
| `durationMinutes` | int | No | Target interview length |
| `candidateName` | string | No | Candidate's name |

**Response:** `{code: 0, data: {agent_id, channel_name, status, current_interviewer, panel}}`

---

### `POST /stopAgent`
Stops a running interview.

| Field | Type | Required | Description |
|---|---|---|---|
| `agentId` | string | No | Agent ID (stale after handoffs) |
| `channelName` | string | No | Preferred — stable across handoffs |

---

### `GET /panelState?channelName=...`
Live panel snapshot — which interviewer is speaking and why.

**Response:** `{code: 0, data: {current_interviewer, current_interviewer_label, panel: [...], last_switch_reason, last_switch_action}}`

---

### `POST /getAssessment`
Evidence-linked final panel assessment.

| Field | Type | Required |
|---|---|---|
| `channelName` | string | Yes |

**Response:** `{code: 0, data: {overall_score, competencies: [...], panel_notes: [...], contradictions, recommendation, role_fit: {...}}}`

---

### `POST /scrapeJobs`
Scrape job listings.

| Field | Type | Required | Description |
|---|---|---|---|
| `roles` | string[] | Yes | Up to 10 role names |
| `location` | string | No | Default: "India" |
| `is_internship` | bool | No | Default: false |
| `results_per_role` | int | No | Default: 5, max: 20 |

---

### `POST /analyzeResume`
Resume analysis (multipart form).

| Field | Type | Required |
|---|---|---|
| `file` | PDF Upload | Yes |
| `targetRole` | string (form) | Yes |

**Response:** `{code: 0, data: {candidate_summary, target_role_fit, top_skills, strengths, gaps, best_suitable_roles, flow: {nodes, edges}}}`

---

## Next.js API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/register` | POST | Register new user (bcrypt hash → MongoDB) |
| `/api/auth/login` | POST | Login (bcrypt compare → JWT) |
| `/api/auth/verify` | POST | Verify JWT token |
| `/api/auth/profile` | GET | Fetch user profile |
| `/api/chat/messages` | POST/GET | Save/fetch interview messages (MongoDB upsert by turnId) |
| `/api/chat/sessions` | POST/GET | Save/fetch interview sessions (upsert by sessionId) |
| `/api/chat/sessions/assessment` | POST | Attach assessment data to a session |
| `/api/jobs/scrape` | POST | Proxy to Python backend `/scrapeJobs` |

---

# 9. Database

## Database Type
**MongoDB Atlas** — cloud-hosted, accessed via the `mongodb` npm driver.

**Database name:** `knotic-chat`

## Collections

### `users`
| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `email` | string | Unique user email |
| `name` | string | Display name |
| `password` | string | bcrypt hash (10 rounds) |
| `createdAt` | Date | Registration timestamp |
| `updatedAt` | Date | Last update |

### `messages`
| Field | Type | Description |
|---|---|---|
| `channelId` | string | Agora channel name |
| `sessionId` | string | Unique session identifier |
| `turnId` | number | Turn number (upsert key) |
| `speaker` | string | `"user"` / `"technical_interviewer"` / `"product_manager"` / `"hiring_manager"` |
| `speakerName` | string | `"You"` / `"Abhinav"` / `"Anisha"` / `"Alia"` |
| `text` | string | Message content |
| `timestamp` | number | Client-side timestamp |
| `status` | string | Turn status |

### `sessions`
| Field | Type | Description |
|---|---|---|
| `sessionId` | string | Unique session ID (upsert key) |
| `channelId` | string | Agora channel name |
| `userId` | string | MongoDB user `_id` |
| `userEmail` | string | For display |
| `userName` | string | For display |
| `startedAt` | number | Timestamp |
| `endedAt` | number | Timestamp |
| `duration` | number | Seconds |
| `messages` | array | All messages in the session |
| `transcript` | string | Full text transcript |
| `result` | object | `{scores, assessment, feedback, interviewerNotes}` |
| `assessment` | object | Full panel assessment (competencies, role_fit, etc.) |
| `status` | string | `"completed"` / `"abandoned"` / `"in_progress"` |

## Query Flow
Every API route file duplicates a `connectToDatabase()` helper that caches the MongoDB client and db references. All writes use upsert to handle duplicate saves gracefully.

---

# 10. Web Scraper

## Overview

The job scraper uses the `python-jobspy` library to fetch job listings from LinkedIn.

**File:** `server/src/job_scraper.py`

| Aspect | Detail |
|---|---|
| **Websites Scraped** | LinkedIn (via `site_name=["linkedin"]`) |
| **Why** | To suggest real job openings that match roles recommended by the resume analyzer |
| **Library** | `python-jobspy` (wraps `tls-client` for anti-bot evasion) |
| **Pagination** | Handled internally by JobSpy (`results_wanted` parameter) |
| **Rate Limiting** | Roles are scraped sequentially (one at a time), max 10 roles, max 20 results per role |
| **Proxy/UA Rotation** | Handled by `tls-client` inside JobSpy (mimics real browser TLS fingerprints) |
| **CAPTCHA** | Not explicitly handled — relies on `tls-client` to avoid triggering CAPTCHAs |
| **Data Cleaning** | Titles and companies are stripped; descriptions are truncated to 300 characters; rows without titles are dropped |
| **Error Recovery** | Individual role failures return empty arrays; the overall request still succeeds |

```
POST /scrapeJobs
    ↓
Validate roles (max 10)
    ↓
For each role:
    ↓
    Construct search term (append 'intern' if is_internship)
    ↓
    jobspy.scrape_jobs(site: LinkedIn, results_wanted, hours_old)
    ↓
    DataFrame empty? → Return []
    ↓
    Convert rows to dicts, clean/truncate fields
    ↓
    Filter: must have title → Return job list
    ↓
Return {role: [jobs]}
```

---

# 11. Background Jobs

The only background job in the system is the **panel monitor loop** (`Agent._monitor_panel()`):

- **Type:** `asyncio.Task` created per active interview channel.
- **Lifecycle:** Created when `startAgent` is called; cancelled when `stopAgent` is called or the Agora session goes away (404).
- **Behavior:** Polls every `POLL_INTERVAL_SECONDS` (default 3s), fetches conversation history, asks the Gemini orchestrator for handoff decisions, and executes handoffs.

There are no cron jobs, queues, or worker processes.

---

# 12. Authentication

## Login Flow

```
User enters email + password
    ↓
AuthContext → POST /api/auth/login {email, password}
    ↓
Next.js API route → MongoDB: Find user by email
    ↓
bcrypt.compare(password, stored hash)
    ↓
jwt.sign({userId, email}, JWT_SECRET, expiresIn: '7d')
    ↓
Response: {token, user: {id, email, name}}
    ↓
Frontend stores in localStorage (auth_token, auth_user)
    ↓
React state updated → AppShell renders protected content
```

## Token Details
- **Algorithm:** HS256 (default for `jsonwebtoken`)
- **Expiry:** 7 days
- **Secret:** `JWT_SECRET` environment variable (same value must be set in both `server/.env.local` and `web/.env.local`)
- **Storage:** `localStorage` keys `auth_token` and `auth_user`

## Authorization
- The `AppShell` component gates all routes — if no user/token is in state, it renders the login form.
- **No server-side auth middleware exists on the Python backend** — the FastAPI endpoints are unprotected. Auth is frontend-only.
- The Next.js API routes (`/api/chat/*`) also don't verify the JWT.

## Roles & Permissions
None — there's no role-based access control. All authenticated users have identical access.

---

# 13. Configuration

## `server/.env.local`

| Variable | Purpose | Default |
|---|---|---|
| `AGORA_APP_ID` | Agora project App ID | *required* |
| `AGORA_APP_CERTIFICATE` | Agora project certificate | *required* |
| `GEMINI_API_KEY` | Google Gemini API key | *required* |
| `GEMINI_MODEL` | Gemini model for candidate-facing LLM | `gemini-1.5-flash` |
| `GEMINI_ORCHESTRATOR_MODEL` | Model for panel handoff decisions | Falls back to `GEMINI_MODEL` |
| `GEMINI_ASSESSMENT_MODEL` | Model for post-interview scoring | Falls back to `GEMINI_MODEL` |
| `GEMINI_RESUME_MODEL` | Model for resume analysis | Falls back to `GEMINI_MODEL` |
| `MURF_API_KEY` | Murf AI TTS API key | *required* |
| `MURF_LOCALE` | TTS locale | `en-US` |
| `MURF_RATE` | Speech rate adjustment | `0` |
| `MURF_PITCH` | Pitch adjustment | `0` |
| `MURF_MODEL` | Murf TTS model | `FALCON` |
| `MURF_SAMPLE_RATE` | Audio sample rate | `24000` |
| `VOICE_TECHNICAL` | TTS voice for Technical Interviewer | `Abhinav` |
| `VOICE_PRODUCT` | TTS voice for Product Manager | `Anisha` |
| `VOICE_HIRING_MANAGER` | TTS voice for Hiring Manager | `Alia` |
| `PANEL_POLL_INTERVAL_SECONDS` | Monitor loop interval | `3` |
| `PANEL_MIN_SECONDS_BETWEEN_SWITCHES` | Handoff cooldown | `20` |
| `JWT_SECRET` | JWT signing secret | *required* |

## `web/.env.local`

| Variable | Purpose |
|---|---|
| `AGENT_BACKEND_URL` | Python backend URL (used by Next.js rewrites) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | JWT signing secret (must match server) |
| `NEXT_PUBLIC_LIVEAVATAR_API_KEY` | LiveAvatar API key (not currently used) |

---

# 14. External Integrations

| Service | Purpose | Auth | Error Handling |
|---|---|---|---|
| **Agora Conversational AI** | Real-time voice pipeline (RTC + STT + LLM + TTS) | App ID + Certificate | Session 404 → clean up channel; fetch failures → retry up to 5 times |
| **Google Gemini** | Candidate-facing LLM, orchestrator decisions, assessment scoring, resume analysis | API key via `genai.configure()` | Catch-all → log warning, return fallback/None |
| **Murf AI TTS** | Text-to-speech for interviewer voices | API key | Handled by Agora SDK internally |
| **Deepgram** | Speech-to-text (Nova 3 model) | Handled by Agora SDK | Handled by Agora SDK internally |
| **MongoDB Atlas** | User accounts, chat messages, interview sessions | Connection string with embedded credentials | Catch → 500 response |
| **LinkedIn (via JobSpy)** | Job listing scraping | No API key (web scraping via `tls-client`) | Per-role failure → empty array |
| **MediaPipe** | Client-side face/gaze detection | None (WASM runs locally) | GPU delegate failure → CPU fallback → error state |

---

# 15. Error Handling

## Backend
- **Route-level:** Every endpoint wraps its logic in try/except. `_log_route_error()` logs the route name, request context, and full traceback. `_to_http_error()` maps `ValueError` → 400, `RuntimeError` → 500, everything else → 500.
- **Orchestrator:** If the Gemini call fails, `decide()` returns `None` (no handoff) rather than crashing the monitor loop.
- **Assessor:** If the Gemini call fails, `assess()` returns a fallback response with `error: True` and the number of candidate turns recorded.
- **History fetch:** After 5 consecutive failures (non-404), the monitor gives up on that channel.

## Frontend
- **ErrorBoundary:** Wraps the `ConversationComponent` to catch render-time crashes.
- **Connection issues:** Tracked in `connectionIssues` state array (max 6), displayed in `ConnectionStatusPanel`.
- **RTM noise suppression:** Known RTM SDK self-healing errors (presence retries, teardown noise) are downgraded from `console.error` to `console.debug`.
- **Proctoring:** Camera permission denied → error message in PiP. FaceLandmarker GPU failure → CPU fallback.

---

# 16. Important Algorithms

## Panel Orchestrator Decision (Prompt-Based)
- **Purpose:** Decide which of 3 interviewers should speak next.
- **How:** A Gemini prompt with the full transcript, current interviewer, and rules (honor explicit requests, prefer status quo, require evidence for switching). Returns structured JSON.
- **Why:** Avoids a fixed question script — the interview adapts to the candidate's actual answers.
- **Complexity:** O(T) where T is transcript length (sent fully to Gemini).

## Leaky Bucket Timers (useFaceGazeMonitor)
- **Purpose:** Distinguish sustained violations (person looking away for 5+ seconds) from momentary noise (a blink, a glance).
- **How:** Each violation type has a "bucket" that fills during bad frames and drains during good frames (at 1.5x the fill rate). The violation triggers when the bucket reaches threshold.
- **Why:** A strict "N consecutive bad frames" approach was too fragile — a single good frame from noise would reset the counter.

## Iris Gaze Estimation
- **Purpose:** Determine if the candidate is looking at the screen.
- **How:** Normalizes the iris center position within the eye socket (landmarks 468-477). Computes offset from eye center as a fraction of eye width. Averages across both eyes. Also checks head-yaw ratio (nose-to-eye-corner asymmetry).
- **Alternatives:** Eye-tracking APIs (more accurate but require calibration), or gaze-only without iris (misses head turns).

## Viseme Scheduling
- **Purpose:** Sync avatar mouth shapes to speech.
- **How:** Words from the transcript are pushed into a queue. Each frame, the scheduler pops the next word, maps its characters to viseme shapes, and returns the current viseme for the 3D renderer. If no timing data is available from the TTS, word duration is estimated from character count.

---

# 17. Data Flow

```
Input Sources:
  [Candidate Voice] → Deepgram STT → Gemini LLM → Murf TTS → [Audio Output]
  [PDF Resume]      → Gemini Resume Analyzer → [Flow Chart + Scores]
  [Interview Setup]  → In-Memory State → Orchestrator/Assessor

Storage:
  - In-Memory (Python dicts): active sessions, transcripts, panel state
  - MongoDB: users, messages, sessions, assessments
  - localStorage: auth token, resume analysis cache

Processing:
  - Gemini LLM (candidate-facing): generates interview responses
  - Gemini Orchestrator: decides interviewer handoffs
  - Gemini Assessor: produces final scores
  - Gemini Resume: analyzes PDF resumes
  - JobSpy: scrapes LinkedIn listings
```

---

# 18. Dependencies

## Backend (Python)

| Package | Why |
|---|---|
| `fastapi` | Async web framework with automatic OpenAPI docs and Pydantic validation |
| `uvicorn` | ASGI server for FastAPI |
| `agora-agents` | Agora Conversational AI SDK — manages STT/LLM/TTS pipelines |
| `google-generativeai` | Google's Gemini API client (used for orchestrator, assessor, resume analysis) |
| `python-dotenv` | Loads `.env.local` files into `os.environ` |
| `python-jobspy` | Web scraping library for job boards (LinkedIn) |
| `python-multipart` | Required by FastAPI for file upload (`File()`, `Form()`) parsing |
| `httpx` | HTTP client (used internally by agora-agents) |
| `socksio` | SOCKS proxy support for httpx |
| `requests` | HTTP client (fallback) |

## Frontend (Node.js)

| Package | Why |
|---|---|
| `next` | React meta-framework with SSR, API routes, file-system routing |
| `react` / `react-dom` | UI library |
| `agora-rtc-sdk-ng` / `agora-rtc-react` | Agora real-time communication (audio channels) |
| `agora-rtm` | Agora real-time messaging (signaling, transcript delivery) |
| `agora-agent-client-toolkit` | Agora Voice AI SDK (transcript helpers, agent state tracking) |
| `agora-agent-uikit` | Pre-built UI components (mic button, agent visualizer) |
| `three` / `@react-three/fiber` / `@react-three/drei` | 3D rendering for avatar stage |
| `@mediapipe/tasks-vision` | On-device face/eye detection (WASM) |
| `mongodb` | MongoDB driver for Next.js API routes |
| `bcrypt` | Password hashing |
| `jsonwebtoken` | JWT generation/verification |
| `lucide-react` | Icon library |
| `tailwindcss` | Utility-first CSS framework |
| `class-variance-authority` / `clsx` / `tailwind-merge` | Component variant styling utilities |

---

# 19. Design Patterns

| Pattern | Where | How |
|---|---|---|
| **Facade** | `Agent` class | Hides the complexity of Agora sessions, Gemini calls, transcript management, and handoff logic behind `start()`, `stop()`, `get_assessment()` |
| **Strategy** | `PanelOrchestrator`, `PanelAssessor` | Decision-making and scoring are encapsulated in separate classes with clean interfaces |
| **Observer** | Agora Voice AI events | `ConversationComponent` subscribes to `TRANSCRIPT_UPDATED`, `AGENT_STATE_CHANGED`, `MESSAGE_ERROR` events |
| **Singleton** | `Agent`, `ResumeAnalyzer` in server.py | Instantiated once at module load; shared across all requests |
| **Proxy** | Next.js API routes for jobs | `/api/jobs/scrape` proxies to the Python backend's `/scrapeJobs` |
| **Leaky Bucket** | `useFaceGazeMonitor` | Used for debouncing face/gaze violation signals |
| **Pipeline Restart** | `_switch_interviewer()` | Voice can't be hot-swapped on a running Agora session, so a handoff = stop old + start new with context carried forward |
| **Module-level Cache** | MongoDB connection pooling | Each API route file caches `MongoClient` and `Db` in module-level variables |

---

# 20. Security

## Current Security Measures
- **Password hashing:** bcrypt with 10 salt rounds
- **JWT tokens:** 7-day expiry, HS256
- **CORS:** Allows all origins (`allow_origins=["*"]`)
- **File validation:** Resume uploads are checked for MIME type (PDF only) and size (8MB max)

## Vulnerabilities & Concerns

- **WARNING: API keys in `.env.local` are committed with real values** — Agora, Gemini, Murf, and MongoDB credentials are visible in the repository. These should be rotated and added to `.gitignore`.
- **WARNING: No server-side auth on FastAPI endpoints** — Anyone who knows the backend URL can call `/startAgent`, `/scrapeJobs`, etc. without authentication. Auth is frontend-only.
- **WARNING: No JWT verification on Next.js API routes** — The chat and session endpoints don't verify the JWT token, so any client can read/write any user's data.
- **WARNING: CORS allows all origins** — Fine for development, but should be restricted in production.
- **CAUTION: MongoDB connection string contains credentials in plain text** in `.env.local`.

## Recommendations
1. Add JWT middleware to FastAPI endpoints
2. Add JWT verification to Next.js API routes (check `Authorization` header)
3. Restrict CORS origins to the frontend domain
4. Move all secrets to a secrets manager (e.g., Google Secret Manager, AWS Secrets Manager)
5. Add rate limiting to prevent abuse of Gemini/scraping endpoints

---

# 21. Performance

## Potential Bottlenecks

| Area | Concern | Impact |
|---|---|---|
| **Gemini Orchestrator calls** | Every 3 seconds, the full transcript is sent to Gemini | Latency grows with transcript length; `_format_transcript()` caps at 24 recent entries to mitigate |
| **Pipeline restart on handoff** | Stopping and starting an Agora session creates a real audio gap | Users hear silence during handoffs (~1-2 seconds) |
| **Sequential job scraping** | `scrape_multiple_roles()` scrapes roles one by one | 10 roles x network latency = slow endpoint |
| **MongoDB duplicated connections** | Each API route file has its own `connectToDatabase()` with module-level caching | Works in practice but risks connection leaks with many serverless instances |
| **In-memory state** | Transcripts, sessions, assessments are all stored in Python dicts | Lost on server restart; no horizontal scaling |

## Optimizations Present
- **Transcript truncation:** Orchestrator prompt uses last 24 entries; assessment uses last 200.
- **History cursor:** `history_seen` index avoids re-processing already-seen messages.
- **Assessment caching:** `_assessments` dict caches results per channel.
- **Resume analysis cache:** Frontend stores results in `localStorage` to avoid re-uploading.
- **Avatar model preloading:** All 3 `.glb` models are preloaded on mount.
- **Viseme scheduler:** Word queue consumed frame-by-frame rather than re-rendering React on every word.

---

# 22. File Relationships

```
Backend File Graph:
  server.py ──→ agent.py (Agent, PanelOrchestrator, PanelAssessor)
  server.py ──→ resume.py (ResumeAnalyzer)
  server.py ──→ job_scraper.py (scrape_multiple_roles)

Frontend Component Graph:
  layout.tsx → AppShell → Sidebar
                       → page.tsx → Dashboard
                       → interview/page.tsx → InterviewFlow
                                               ├─→ InterviewSetupForm
                                               ├─→ InterviewPrecheck
                                               ├─→ ConversationComponent
                                               │    ├─→ PanelAvatarStage
                                               │    ├─→ QuickstartTranscriptPanel
                                               │    ├─→ PanelIndicator
                                               │    ├─→ ConnectionStatusPanel
                                               │    └─→ MicButtonWithVisualizer
                                               ├─→ ProctoringOverlay
                                               ├─→ AssessmentResults → AssessmentBreakdown
                                               └─→ InterviewRejected
                       → resume/page.tsx → ResumeAnalyzerPage → FlowChart
                       → opportunities/page.tsx → OpportunitiesPage

Hook Dependencies:
  InterviewFlow → useFaceGazeMonitor (MediaPipe)
  InterviewFlow → useProctoringStrikes
  InterviewFlow → useInterviewLockdown
  InterviewFlow → useTabHidden
  ConversationComponent → usePanelState (polls backend)
  ProctoringOverlay → useCameraPreviewRef
  ProctoringOverlay → useDraggable

Library Dependencies:
  ConversationComponent → conversation.ts (transcript normalization)
  ConversationComponent → mongoChat.ts (MongoDB persistence)
  ConversationComponent → visemeScheduler.ts → textToVisemes.ts
  PanelAvatarStage → panelAvatars.ts (avatar definitions)
  PanelAvatarStage → avatarAnimations.ts (Three.js animations)
  FlowChart → flowLayout.ts (graph layout)
  Dashboard → mongoChat.ts
  ResumeAnalyzerPage → resumeAnalysisCache.ts
  AssessmentCharts → scoreColor.ts
```

---

# 23. End-to-End Workflow

**Scenario:** A user conducts a practice interview from start to finish.

1. **Login:** User enters email/password → `POST /api/auth/login` → bcrypt compare → JWT issued → stored in localStorage.
2. **Dashboard:** `Dashboard.tsx` renders; fetches past sessions from MongoDB via `getUserSessions()`.
3. **New Interview:** User clicks "New Interview" → navigates to `/interview` → `InterviewSetupForm` renders.
4. **Setup:** User enters role ("Frontend Engineer"), company ("Google"), optional JD. Clicks "Start Interview".
5. **Precheck:** `InterviewPrecheck` activates the camera via `useFaceGazeMonitor`. Requests fullscreen via `useInterviewLockdown`. User confirms readiness.
6. **Connection:** `InterviewFlow.handleStartConversation()` fires:
   - `getConfig()` → FastAPI generates Agora credentials.
   - `startAgent()` → FastAPI creates the Agora session with Technical Interviewer's voice (Abhinav). Starts `_monitor_panel()` task.
   - RTM client logs in, subscribes to the channel.
7. **Live Call:** `ConversationComponent` renders. Agora RTC connects. The Technical Interviewer greets the candidate. `PanelAvatarStage` shows the 3D avatar with lip-sync.
8. **Proctoring:** `ProctoringOverlay` shows the self-view PiP. `useFaceGazeMonitor` runs MediaPipe face detection every frame. `useProctoringStrikes` tracks violations.
9. **Conversation:** Candidate speaks → Deepgram STT → Gemini generates response → Murf TTS → audio plays. Transcript updates stream via RTM. Messages are saved to MongoDB in real-time.
10. **Handoff:** After a few minutes, the monitor loop's Gemini orchestrator decides the Product Manager should ask about customer impact. `_switch_interviewer()` stops the current session and starts a new one with Anisha's voice. The avatar changes on the frontend.
11. **End Call:** User clicks "End Interview". `handleEndConversation()` fires:
    - Saves the full session to MongoDB.
    - Calls `stopAgent()` on the backend.
    - RTM logout.
12. **Assessment:** `AssessmentResults` renders. `getAssessment()` calls the backend, which runs the `PanelAssessor` Gemini prompt on the full transcript. Returns competency scores, role fit, strengths/weaknesses.
13. **Review:** User sees scores, reads feedback, downloads transcript. Assessment is saved to MongoDB.
14. **Opportunities:** User navigates to `/resume`, uploads their PDF, gets analysis + flow chart. Then visits `/opportunities` — the app scrapes LinkedIn for jobs matching the recommended roles.

---

# 24. How to Add Features

## Add a New API Endpoint
1. Define a Pydantic `BaseModel` in `server/src/server.py`.
2. Add a `@router.get()` or `@router.post()` handler function.
3. Add the corresponding rewrite rule in `web/next.config.ts` (so the frontend can call it via `/api/...`).
4. Add a client function in `web/src/services/api.ts`.

## Add a New Page
1. Create a directory under `web/app/` (e.g., `web/app/mypage/`).
2. Add a `page.tsx` that renders your component.
3. Create the component in `web/src/components/`.
4. Add a navigation link in `Sidebar.tsx` (the `NAV_LINKS` array).

## Add a New Interviewer to the Panel
1. Add a new entry in `PANEL_DEFS` and `PANEL_ORDER` in `agent.py`.
2. Add the corresponding voice env variable in `.env.local`.
3. Add a new entry in `PANEL_AVATARS` in `panelAvatars.ts` with a model URL and accent color.
4. Place the `.glb` model in `web/public/models/`.

## Add a New Job Scraping Source
1. Modify the `site_name` list in `job_scraper.py` (e.g., `["linkedin", "indeed"]`).
2. JobSpy supports: `linkedin`, `indeed`, `zip_recruiter`, `glassdoor`, `google`.

## Add a MongoDB Collection
1. Add a new Next.js API route under `web/app/api/`.
2. Copy the `connectToDatabase()` helper (or extract it into a shared module — see recommendations).
3. Use the `db.collection('your_collection')` pattern.

---

# 25. Summary

## Key Takeaways
- PROBE is a sophisticated AI interview platform combining **real-time voice AI** (Agora), **LLM reasoning** (Gemini), **3D avatars** (Three.js), and **client-side proctoring** (MediaPipe).
- The core innovation is the **dynamic panel orchestrator** — a separate Gemini call that watches the transcript and decides which interviewer should speak next, making interviews adaptive rather than scripted.
- The system uses a **pipeline restart pattern** for voice switching — since TTS voices can't be hot-swapped on a running Agora session, handoffs are implemented as graceful stop+restart with context forwarding.

## Architecture Strengths
- **Clean separation of concerns:** Resume analysis, interview orchestration, and job scraping are fully independent.
- **Resilient proctoring:** Leaky bucket timers, GPU→CPU fallback, grace periods, and cooldowns make the proctoring robust against noise.
- **Real-time lip-sync:** The viseme scheduler decouples word arrival from rendering, preventing React re-renders on every word.
- **Evidence-grounded AI:** Both the orchestrator and assessor prompts are designed to avoid hallucination — they explicitly instruct the model to only reference what's in the transcript.

## Weaknesses & Technical Debt
1. **All state is in-memory (Python dicts):** Restarting the server loses all active interviews and transcripts. No horizontal scaling.
2. **Duplicated MongoDB connection logic:** `connectToDatabase()` is copy-pasted across 6+ API route files. Should be a shared utility.
3. **No backend auth:** FastAPI endpoints are wide open — any client can start/stop interviews, scrape jobs, or fetch assessments.
4. **Deprecated Gemini SDK:** The project uses `google-generativeai` which is deprecated in favor of `google.genai`.
5. **Hardcoded secrets in `.env.local`:** API keys are checked into the repository with real values.
6. **No database indexes:** MongoDB collections have no explicit indexes — queries will slow as data grows.
7. **No WebSocket for panel state:** The frontend polls `/panelState` on an interval rather than receiving push updates.

## Suggested Improvements
1. **Move interview state to Redis/MongoDB** — enables horizontal scaling and survives restarts.
2. **Extract shared MongoDB connection utility** — single `connectToDatabase()` function used by all API routes.
3. **Add server-side authentication middleware** to both FastAPI and Next.js API routes.
4. **Migrate to `google.genai`** (the successor to `google-generativeai`).
5. **Add MongoDB indexes** on `sessions.userId`, `sessions.sessionId`, `messages.channelId+sessionId+turnId`.
6. **Replace panel state polling with WebSocket/SSE** for real-time panel updates.
7. **Parallelize job scraping** with `asyncio.gather()` instead of sequential role iteration.
8. **Add rate limiting** to Gemini and scraping endpoints.
