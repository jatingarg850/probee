# Quick Start: Gemini + Murf + Deepgram

## 5-Minute Setup

### 1. Get API Keys (3 min)
```bash
# Gemini
Go to: https://ai.google.dev/ → Get API Key → Copy GEMINI_API_KEY

# Murf AI
Go to: https://www.murf.ai/ → Sign up → Create API Key → Copy MURF_API_KEY

# Agora
Go to: https://console.agora.io → Create Project → Copy APP_ID & CERTIFICATE
```

### 2. Update Configuration (1 min)
```bash
# Edit server/.env.local
GEMINI_API_KEY=your_key_here
MURF_API_KEY=your_key_here
AGORA_APP_ID=your_id_here
AGORA_APP_CERTIFICATE=your_cert_here
```

### 3. Create Tunnel (1 min)
```bash
# In new terminal
ngrok http 8000

# Copy the https URL that appears, e.g:
# https://abc123xyz.ngrok-free.dev
```

### 4. Update Tunnel URL (30 sec)
```bash
# In server/.env.local, update:
CUSTOM_LLM_URL=https://abc123xyz.ngrok-free.dev/llm/chat/completions
```

---

## Installation

```bash
# Backend
cd server
pip install -r requirements.txt

# Frontend
cd ../web
bun install
# or: npm install
```

---

## Run

```bash
# From project root
bun run dev

# Or manually:
# Terminal 1: cd server && uvicorn src.server:app --reload
# Terminal 2: cd web && AGENT_BACKEND_URL=http://localhost:8000 bun run dev
```

---

## Test

Open: **http://localhost:3000**

Click "Start Conversation" → Speak to the agent

Try: "I want to fly to Paris" → "Book the morning one" → "What's my itinerary?"

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `GEMINI_API_KEY not set` | Add key to `server/.env.local` |
| `MURF_API_KEY not configured` | Add key to `server/.env.local` |
| Agent doesn't speak | Verify ngrok tunnel is running and `CUSTOM_LLM_URL` is updated |
| Import errors | Run `pip install -r requirements.txt` |
| Can't reach frontend | Check `web/.env.local` has `AGENT_BACKEND_URL=http://localhost:8000` |

---

## API Endpoints

```bash
# Health Check
curl http://localhost:8000/health

# LLM Endpoint
curl http://localhost:8000/llm/health

# API Docs
http://localhost:8000/docs
```

---

## Components

| Component | Purpose | Status |
|-----------|---------|--------|
| **Gemini** | Understand user intent | ✅ Configured |
| **Murf** | Generate natural speech | ✅ Configured |
| **Deepgram** | Transcribe speech | ✅ Ready |
| **Agora** | Real-time communication | ✅ Ready |
| **SQLite** | Store bookings | ✅ Ready |

---

## Full Documentation

- `SETUP_GUIDE.md` - Complete setup instructions
- `CONFIGURATION_SUMMARY.md` - Detailed configuration reference
- `README.md` - Project overview
- `ARCHITECTURE.md` - System design

---

## Common Tasks

### Change TTS Voice
```bash
# In server/.env.local, change:
MURF_VOICE_ID=en-US-nate  # or en-US-seth, en-US-skyler, etc.
```

### Customize Greeting
```bash
# In server/.env.local, change:
AGENT_GREETING=Hello! Welcome to our travel service!
```

### Use Different Backend Port
```bash
# In server/.env.local, add:
PORT=9000

# In web/.env.local, update:
AGENT_BACKEND_URL=http://localhost:9000
```

---

## What's Configured

✅ **LLM**: Google Gemini API (via ngrok tunnel)
✅ **TTS**: Murf AI (custom implementation)
✅ **STT**: Deepgram Nova-3 (managed by Agora)
✅ **Database**: SQLite with itinerary persistence
✅ **Frontend**: Next.js + React with real-time RTC/RTM
✅ **Backend**: FastAPI with 3-persona handoff FSM

---

## Next: Production Deploy

When ready to deploy:
1. Replace ngrok with real domain
2. Add authentication to API endpoints
3. Set up monitoring and logging
4. Configure HTTPS/TLS
5. Add rate limiting
6. Use environment-specific configs

See `SETUP_GUIDE.md` for full deployment checklist.

---

**Status**: ✅ Ready to Run
**Last Updated**: August 2026
