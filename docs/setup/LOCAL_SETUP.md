# Local Testing Setup

This guide walks you through setting up the Agora agent handoff recipe for **local testing** without requiring a public tunnel.

## Architecture

- **Backend** (FastAPI): Runs at `http://localhost:8000`
  - Token endpoints: `/get_config`, `/startAgent`, `/stopAgent`
  - LLM endpoint: `/llm/chat/completions` (called by Agora agent)
  - STT: Deepgram Nova-3 (managed by Agora)
  - TTS: Murf AI (via native Agora vendor)

- **Frontend** (Next.js): Runs at `http://localhost:3000`
  - Calls backend via Next rewrites
  - Web UI for testing voice conversations

## Prerequisites

1. **Agora Credentials** (already set in `.env.local`)
   - `AGORA_APP_ID`
   - `AGORA_APP_CERTIFICATE`

2. **API Keys** (get from respective services)
   - **Gemini API Key**: https://ai.google.dev/
   - **Murf API Key**: https://murf.ai/api/dashboard

3. **Python 3.9+** (for backend)
4. **Node.js / Bun** (for frontend)

## Setup Steps

### 1. Install Backend Dependencies

```powershell
cd server
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Edit `server/.env.local` with your API keys:

```env
# Existing (already configured)
AGORA_APP_ID=ccf490ab174f464387d04e032863552b
AGORA_APP_CERTIFICATE=81a6c5fa54494007ac2e74bc4b62ca40

# Add your API keys
GEMINI_API_KEY=your_gemini_api_key_here
MURF_API_KEY=your_murf_api_key_here

# Local testing (already configured)
CUSTOM_LLM_URL=http://localhost:8000/llm/chat/completions
```

### 3. Start the Backend

```powershell
cd server
python -m uvicorn src.server:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### 4. Install Frontend Dependencies (in another terminal)

```powershell
cd web
bun install
```

### 5. Start the Frontend

```powershell
cd web
bun run dev
```

You should see:
```
▲ Next.js 16.x.x
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 6. Open Browser

Go to: **http://localhost:3000**

## Testing the Agent

1. Click "Start Call" on the web UI
2. Speak to the agent (microphone required)
3. Agent should respond with Murf TTS voice

### Test Scenarios

**Triage** (initial greeting):
- User: "Hi, I want to go on vacation"
- Agent: Responds with destination inquiry

**Booking** (destination provided):
- User: "I want to go to Paris"
- Agent: Shows flight options and asks to book

**Trip Support** (after booking):
- User: "Cancel my flight"
- Agent: Shows confirmation and cancels booking

## Troubleshooting

### Backend Won't Start
```
ValueError: MURF_API_KEY is required
```
→ Set `MURF_API_KEY` in `.env.local`

```
ValueError: GEMINI_API_KEY not set
```
→ Set `GEMINI_API_KEY` in `.env.local`

### Frontend Can't Connect to Backend
```
Error: Failed to get config
```
→ Check backend is running: `curl http://localhost:8000/get_config`

### Agent Doesn't Respond
1. Check microphone permissions in browser
2. Check Agora credentials in `.env.local`
3. Check LLM endpoint in logs: `CUSTOM_LLM_URL=http://localhost:8000/llm/chat/completions`

### Gemini API Errors
- Verify API key is valid at https://ai.google.dev/
- Check quota limits in Google Cloud console

### Murf TTS Errors
- Verify API key is valid at https://murf.ai/api/dashboard
- Check voice_id exists (default: "Gordon")
- Verify sample_rate is supported (24000 Hz standard)

## Verification Commands

```powershell
# Check backend health
curl http://localhost:8000/llm/health

# Check config generation
curl http://localhost:8000/get_config

# Check frontend build
cd web && bun run build
```

## File Structure

```
recipe-agent-handoff/
├── server/
│   ├── src/
│   │   ├── agent.py      # Agora agent + MurfTTS config
│   │   ├── llm.py        # Gemini LLM endpoint
│   │   └── server.py     # FastAPI + token endpoints
│   ├── .env.local        # API keys (local testing)
│   └── requirements.txt  # Python dependencies
├── web/
│   ├── app/
│   │   ├── page.tsx      # Main UI
│   │   └── layout.tsx    # Layout
│   └── package.json      # Frontend dependencies
└── LOCAL_SETUP.md        # This file
```

## Stack Overview

- **STT**: Deepgram Nova-3 (speech-to-text)
- **LLM**: Google Gemini (via `/llm/chat/completions`)
- **TTS**: Murf AI (native Agora vendor)
- **Backend**: FastAPI (Python)
- **Frontend**: Next.js 16 + React 19 (TypeScript)
- **Persistence**: SQLite (itinerary storage)

## Notes

- Backend and frontend run in separate processes but on localhost
- The agent's LLM stage calls back to the same process at `/llm/chat/completions`
- No public tunnel needed for local testing
- Murf TTS provides 150+ natural voices for the agent
- Deepgram STT is managed by Agora and requires no separate key

## Next Steps

1. Get API keys from Gemini and Murf
2. Update `.env.local` with your keys
3. Run backend and frontend
4. Test at http://localhost:3000

Happy testing!
