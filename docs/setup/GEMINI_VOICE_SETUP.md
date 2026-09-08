# Gemini LLM with Dynamic Voice Switching

This setup uses **Gemini** as the LLM with **Murf TTS** for voice synthesis. Voices change automatically based on the conversation context (Triage → Booking → Trip Support).

## Voice Configuration

Voices are configured via environment variables in `server/.env.local`:

```env
# TTS Voice Configuration (Per Persona)
VOICE_TRIAGE=Anisha        # Initial greeting voice
VOICE_BOOKING=Abhinav      # Booking specialist voice
VOICE_TRIP_SUPPORT=Alia    # Trip support voice
```

Change these to any Murf voice you have access to. Available Murf Indian voices include:
- Female: Anisha, Alia
- Male: Abhinav

For other languages, use Murf voices available in your account (e.g., Maya, Seth, Gordon for English).

## How It Works

1. **Gemini LLM** processes the conversation and generates responses
2. **Agent polls conversation history** every couple of seconds and detects the active persona from recent keywords:
   - **Triage**: Initial greeting (voice: Anisha)
   - **Booking**: Flight search & booking (voice: Abhinav)
   - **Trip Support**: Manage booked trip (voice: Alia)
3. **Voice changes** - the Conversational AI Engine only allows the TTS voice to be set at session start (not hot-swapped mid-call), so a persona change triggers a brief, automatic restart of the pipeline in the same channel with the new voice. The agent rejoins under a new `agent_id` and continues the same conversation — the recent transcript is carried into the new session so it does not re-greet the caller. Expect a short (roughly half-second to a couple of seconds) gap in agent audio during the switch.
4. **Murf TTS** synthesizes speech in the current persona's voice

## Setup

1. Set your credentials in `server/.env.local`:
   ```bash
   AGORA_APP_ID=your-app-id
   AGORA_APP_CERTIFICATE=your-certificate
   GEMINI_API_KEY=your-gemini-key
   MURF_API_KEY=your-murf-key
   ```

2. Configure voices:
   ```bash
   VOICE_TRIAGE=Anisha
   VOICE_BOOKING=Abhinav
   VOICE_TRIP_SUPPORT=Alia
   ```

3. Start the agent:
   ```bash
   bun run dev
   ```

4. Open http://localhost:3000 and start a conversation

## Testing Voice Changes

Try this conversation flow:
```
User: "I want to fly to Paris"
→ Persona changes to Booking
→ Voice changes to Abhinav

User: "Book the morning flight"
→ Booking confirmed, voice stays Abhinav

User: "What's my itinerary?"
→ Persona changes to Trip Support  
→ Voice changes to Alia
```

## Architecture

```
User speaks
    ↓
Deepgram STT (nova-3)
    ↓
Gemini LLM (generates response)
    ↓
Agent detects persona from context
    ↓
Selects voice for current persona
    ↓
Murf TTS (synthesizes in persona's voice)
    ↓
User hears response in new voice
```

## Environment Variables

| Variable | Required | Example | Notes |
| --- | :---: | --- | --- |
| `AGORA_APP_ID` | ✅ | | From Agora Console |
| `AGORA_APP_CERTIFICATE` | ✅ | | From Agora Console |
| `GEMINI_API_KEY` | ✅ | | From Google AI |
| `MURF_API_KEY` | ✅ | | From Murf.ai |
| `VOICE_TRIAGE` | | Anisha | Any Murf voice |
| `VOICE_BOOKING` | | Abhinav | Any Murf voice |
| `VOICE_TRIP_SUPPORT` | | Alia | Any Murf voice |
| `MURF_LOCALE` | | en-US | Language code |
| `MURF_RATE` | | 0 | Speech rate |
| `MURF_PITCH` | | 0 | Pitch adjustment |

## Customization

### Change a voice

Edit `server/.env.local`:
```env
VOICE_BOOKING=Maya  # Changed from Abhinav
```

Then restart: `bun run dev`

### Add a persona

1. Update `PERSONA_VOICES` in `server/src/agent.py`
2. Add env vars `VOICE_NEW_PERSONA`
3. Update agent prompt to include new persona logic

### Adjust voice properties

Edit `server/.env.local`:
```env
MURF_RATE=1.1      # Faster speech
MURF_PITCH=5       # Higher pitch
```

## Files

- `server/src/agent.py` - Agent with persona tracking and voice switching
- `server/src/server.py` - FastAPI server with token generation
- `server/.env.local` - Configuration (voice IDs, API keys, etc.)
- `server/src/vendors.py` - Voice config helper

No local LLM endpoint needed - everything uses Gemini directly!
