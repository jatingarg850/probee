# Agora Agent Handoff Recipe - Setup & Startup Guide

## Configuration: Gemini LLM + Murf TTS + Deepgram STT

This guide walks you through setting up and running the travel concierge voice agent with:
- **LLM**: Google Gemini API
- **TTS**: Murf AI (Text-to-Speech)
- **STT**: Deepgram Nova-3 (Speech-to-Text) - managed by Agora

---

## Prerequisites

### 1. System Requirements
- **Python**: 3.10+ (verified: 3.14.3)
- **Node.js**: v16+ (for web frontend)
- **Bun** (optional): For package management
- **ngrok**: For creating public tunnel during local development
- **Git**: For version control

### 2. API Keys Required

#### Agora Console
1. Go to [Agora Console](https://console.agora.io)
2. Create or select a project
3. Copy:
   - **App ID** → Set as `AGORA_APP_ID`
   - **App Certificate** → Set as `AGORA_APP_CERTIFICATE`

#### Google Gemini API
1. Visit [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key" (requires Google Cloud account)
3. Generate an API key
4. Copy → Set as `GEMINI_API_KEY` in `.env.local`

#### Murf AI TTS
1. Visit [Murf.ai](https://www.murf.ai/)
2. Sign up for an account
3. Create an API key in your account settings
4. Copy → Set as `MURF_API_KEY` in `.env.local`
5. Choose a voice ID (e.g., `en-US-maya`, `en-US-nate`)

#### Deepgram (Managed by Agora)
- No separate API key needed - Deepgram is integrated via Agora SDK
- Model: Nova-3 (automatic)

---

## Installation & Setup

### Step 1: Clone or Navigate to Repository
```bash
cd d:\Agora\recipe-agent-handoff
```

### Step 2: Configure Environment Variables

#### For Server (Backend)
Edit `server/.env.local`:

```bash
# Agora Credentials (from Agora Console)
AGORA_APP_ID=your_app_id_here
AGORA_APP_CERTIFICATE=your_app_certificate_here

# Gemini API Key (from https://ai.google.dev/)
GEMINI_API_KEY=your_gemini_api_key_here

# Custom LLM Endpoint (update after creating ngrok tunnel)
CUSTOM_LLM_URL=https://your-ngrok-url/llm/chat/completions
CUSTOM_LLM_API_KEY=any-key-here
CUSTOM_LLM_MODEL=gemini-pro

# Murf AI TTS (from https://www.murf.ai/)
MURF_API_KEY=your_murf_api_key_here
MURF_VOICE_ID=en-US-maya

# Optional: Custom greeting
AGENT_GREETING=Hi! I'm your travel concierge. Where would you like to go?

# Optional: Database path
ITINERARY_DB_PATH=itinerary.db
```

#### For Web (Frontend)
Edit `web/.env.local`:

```bash
AGENT_BACKEND_URL=http://localhost:8000
```

### Step 3: Install Dependencies

#### Backend (Python)
```bash
cd server
python -m pip install --upgrade pip
pip install -r requirements.txt
```

#### Frontend (Node.js/Bun)
```bash
cd web
bun install
# or: npm install
```

### Step 4: Create Public Tunnel (for local development)

Agora cloud needs to reach your `/llm/chat/completions` endpoint. Use ngrok:

```bash
# Install ngrok from https://ngrok.com/download
ngrok http 8000
```

This will output something like:
```
Forwarding  https://abc123def456.ngrok-free.dev -> http://localhost:8000
```

### Step 5: Update CUSTOM_LLM_URL

Update `server/.env.local` with your ngrok URL:
```
CUSTOM_LLM_URL=https://abc123def456.ngrok-free.dev/llm/chat/completions
```

---

## Running the Application

### Option 1: Run Both Services Together (Recommended)

From project root:
```bash
bun run dev
```

This starts:
- Backend (FastAPI) on http://localhost:8000
- Frontend (Next.js) on http://localhost:3000
- API docs on http://localhost:8000/docs

### Option 2: Run Services Separately

#### Terminal 1 - Backend
```bash
cd server
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

#### Terminal 2 - Frontend
```bash
cd web
AGENT_BACKEND_URL=http://localhost:8000 bun run dev
```

### Option 3: Run Backend Only (for testing)

```bash
cd server
python -m uvicorn src.server:app --reload
```

---

## Verification Checklist

### 1. Backend Health Check
```bash
curl http://localhost:8000/health
# Expected: {"status": "ok", "service": "handoff-gemini", "gemini_configured": true}
```

### 2. LLM Endpoint Health
```bash
curl http://localhost:8000/llm/health
# Expected: {"status": "ok", "service": "handoff-gemini", "gemini_configured": true}
```

### 3. API Documentation
Visit: http://localhost:8000/docs (Swagger UI)

### 4. Frontend Verification
Visit: http://localhost:3000
- Should see landing page with "Start Conversation" button
- Should connect successfully if all credentials are configured

---

## Testing the Application

### 1. Open Web Interface
Navigate to http://localhost:3000

### 2. Start a Conversation
Click "Start Conversation" button

### 3. Test the Flow

**Triage Phase:**
- "I want to fly to Paris" 
- Agent should respond with available flights

**Booking Phase:**
- "Book the morning one"
- Agent should confirm booking

**Trip Support Phase:**
- "What's my itinerary?"
- Agent should show booked trip

**Modification Phase:**
- "Change my flight to the evening"
- Agent should update booking

**Cancellation Phase:**
- "Cancel my trip"
- Agent should cancel and confirm

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AGORA_APP_ID` | ✅ | — | Agora Console App ID |
| `AGORA_APP_CERTIFICATE` | ✅ | — | Agora Console App Certificate |
| `GEMINI_API_KEY` | ✅ | — | Google Gemini API Key |
| `CUSTOM_LLM_URL` | ✅ | — | Public ngrok URL + `/llm/chat/completions` |
| `CUSTOM_LLM_API_KEY` | — | `any-key-here` | Bearer token for LLM endpoint |
| `CUSTOM_LLM_MODEL` | — | `gemini-pro` | Model name for Gemini |
| `MURF_API_KEY` | ✅ | — | Murf AI API Key |
| `MURF_VOICE_ID` | — | `en-US-maya` | Murf voice identifier |
| `AGENT_GREETING` | — | Built-in | Custom opening message |
| `ITINERARY_DB_PATH` | — | `itinerary.db` | SQLite database location |
| `PORT` | — | `8000` | Backend server port |
| `AGENT_BACKEND_URL` | ✅ | — | (Web only) Backend API URL |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Browser (localhost:3000)                    │
│                  Next.js Frontend (React 19)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch /api/*
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Agent Backend (localhost:8000)                     │
│                    FastAPI Server                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  /get_config, /startAgent, /stopAgent (HTTP)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           ▼                                  │
│         ┌────────────────────────────────────┐              │
│         │    Agora ConvoAI Cloud             │              │
│         │  (RTC/RTM Media + Orchestration)   │              │
│         └────────────────────────────────────┘              │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│    ┌────────────┐   ┌──────────┐   ┌──────────────┐       │
│    │ Deepgram   │   │ /llm/    │   │ Murf AI      │       │
│    │ STT (nova) │   │ Gemini   │   │ TTS (Maya)   │       │
│    └────────────┘   └──────────┘   └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SQLite Itinerary Database                           │   │
│  │  (Persists bookings across sessions)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ (ngrok tunnel)
         │ https://your-ngrok-url/llm/chat/completions
         │
┌────────┴────────────────────────────────────────────────────┐
│              Agora Cloud (External)                          │
│  Calls your /llm endpoint for persona-based responses       │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue: "GEMINI_API_KEY not configured"
**Solution**: 
1. Get key from https://ai.google.dev/
2. Set `GEMINI_API_KEY` in `server/.env.local`
3. Restart backend

### Issue: "MURF_API_KEY not set"
**Solution**:
1. Get key from https://www.murf.ai/
2. Set `MURF_API_KEY` in `server/.env.local`
3. Restart backend

### Issue: "Agent starts but doesn't speak"
**Solution**:
1. Verify `CUSTOM_LLM_URL` is public (not localhost)
2. Check ngrok tunnel is running: `ngrok http 8000`
3. Update `CUSTOM_LLM_URL` in `.env.local` with ngrok URL
4. Restart backend

### Issue: "Frontend can't reach backend"
**Solution**:
1. Verify `AGENT_BACKEND_URL` in `web/.env.local` is correct
2. Ensure backend is running on port 8000
3. Check CORS settings (should be * for localhost)

### Issue: "Import errors" when running backend
**Solution**:
```bash
cd server
pip install --upgrade pip
pip install -r requirements.txt
```

### Issue: "ModuleNotFoundError: No module named 'google'"
**Solution**:
```bash
pip install google-generativeai>=0.3.0
```

---

## Performance Tips

1. **Gemini Model**: Using `gemini-pro` for faster responses
2. **Murf Voice**: Default is `en-US-maya` (female voice)
3. **STT**: Deepgram Nova-3 is the latest and most accurate
4. **Local Development**: Use ngrok for tunneling (free tier available)

---

## Security Notes

⚠️ **Important for Production**:
- Never commit API keys to version control
- Use `.env.local` (already in `.gitignore`)
- Rotate API keys regularly
- Add authentication to `/get_config`, `/startAgent`, `/stopAgent` endpoints
- Implement rate limiting
- Use HTTPS in production
- Validate all inputs from users

---

## Next Steps

1. **Customize the Travel Agent**: Edit `server/src/llm.py` to:
   - Change destinations (Paris, Tokyo, Rome)
   - Modify flight options and pricing
   - Alter greetings and messages
   - Implement additional personas

2. **Add Features**:
   - User authentication
   - Payment integration
   - Email confirmations
   - Multi-language support

3. **Deploy to Production**:
   - Use Docker (Dockerfile provided)
   - Deploy web to Vercel, AWS, or similar
   - Deploy backend to cloud (AWS Lambda, Google Cloud Run, etc.)
   - Configure custom domain
   - Set up SSL/TLS certificates

---

## Resources

- [Agora Documentation](https://docs.agora.io/)
- [Google Gemini API](https://ai.google.dev/)
- [Murf AI Documentation](https://www.murf.ai/docs)
- [Deepgram Documentation](https://developers.deepgram.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review logs in the backend console
3. Check Agora Console for project status
4. Verify API credentials are correct
5. Test with curl commands first before using web UI

---

**Last Updated**: August 2026
**Configuration**: Gemini LLM + Murf TTS + Deepgram STT
