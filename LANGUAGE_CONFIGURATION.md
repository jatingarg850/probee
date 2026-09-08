# KNOTICS LANGUAGE CONFIGURATION

## Where Language is Mentioned in the Codebase

### 1. **Backend Environment Variables** (`server/.env`)

```bash
# TTS Voice Configuration (Per Interviewer)
VOICE_TECHNICAL=Abhinav          # Male voice for technical interviewer
VOICE_PRODUCT=Anisha            # Female voice for product manager
VOICE_HIRING_MANAGER=Alia       # Female voice for hiring manager

# Murf AI TTS Configuration
MURF_LOCALE=en-US               # Language locale for speech synthesis (English - United States)
MURF_RATE=0                      # Speech rate (0 = normal, negative slower, positive faster)
MURF_PITCH=0                     # Voice pitch (0 = normal, negative lower, positive higher)
MURF_MODEL=FALCON                # Murf TTS model version
MURF_SAMPLE_RATE=24000           # Audio sample rate in Hz
```

### 2. **Backend Implementation** (`server/src/agent.py`)

**Lines 911-916: Configuration Loading**
```python
# Murf TTS Configuration
self.murf_locale = os.getenv("MURF_LOCALE", "en-US")  # Default: English (US)
self.murf_rate = int(os.getenv("MURF_RATE", "0"))
self.murf_pitch = int(os.getenv("MURF_PITCH", "0"))
self.murf_model = os.getenv("MURF_MODEL", "FALCON")
self.murf_sample_rate = int(os.getenv("MURF_SAMPLE_RATE", "24000"))
```

**Lines 957-963: TTS Initialization**
```python
def _get_tts_for_persona(self, persona: str) -> MurfTTS:
    voice_id = PANEL_VOICES.get(persona, PANEL_VOICES[PANEL_ORDER[0]])
    return MurfTTS(
        key=self.murf_api_key,
        voice_id=voice_id,
        locale=self.murf_locale,        # ← LANGUAGE SETTING USED HERE
        rate=self.murf_rate,
        pitch=self.murf_pitch,
        model=self.murf_model,
        sample_rate=self.murf_sample_rate,
    )
```

**Lines 985-988: Speech-to-Text Configuration**
```python
llm = Gemini(api_key=self.gemini_api_key, model=self.gemini_model)
stt = DeepgramSTT(model="nova-3", language="en")  # ← STT LANGUAGE: English
tts = self._get_tts_for_persona(persona)
```

### 3. **Voice Configuration** (`server/src/agent.py`)

**Persona Voice Mapping**
```python
PANEL_VOICES = {
    "technical_interviewer": "Abhinav",      # Indian English voice (male)
    "product_manager": "Anisha",             # Indian English voice (female)
    "hiring_manager": "Alia",                # Indian English voice (female)
}
```

These are Murf AI voice IDs configured for **Indian English (en-IN)** by default, though the locale can be changed.

---

## Current Language Settings

| Component | Language | Locale | Details |
|-----------|----------|--------|---------|
| **STT (Speech-to-Text)** | English | `en` (Deepgram) | Detects candidate speech |
| **TTS (Text-to-Speech)** | English | `en-US` (Murf) | Converts AI responses to audio |
| **Voices** | Indian English | Murf voices: Abhinav, Anisha, Alia | Three persona voices |
| **LLM (Gemini)** | English | Default (US English) | Generates interview questions |
| **Assessment** | English | Default (US English) | Scores and feedback |
| **Frontend UI** | English | Hardcoded | No i18n support currently |

---

## How to Change Language

### To Change Speech Language (STT/TTS):

**1. Update `.env`:**
```bash
MURF_LOCALE=en-GB          # British English
# or
MURF_LOCALE=en-IN          # Indian English
# or
MURF_LOCALE=fr-FR          # French (if Murf supports)
```

**2. Update Deepgram STT language** in `server/src/agent.py` (line 987):
```python
stt = DeepgramSTT(model="nova-3", language="fr")  # Change 'en' to desired language
```

**3. Verify voice compatibility:**
Check that selected Murf voices support the new locale. Murf voice availability varies by language.

### To Change Voices:

Update `server/.env`:
```bash
VOICE_TECHNICAL=different_voice_id_for_locale
VOICE_PRODUCT=different_voice_id_for_locale
VOICE_HIRING_MANAGER=different_voice_id_for_locale
```

Check Murf API documentation for available voice IDs by language/locale.

### To Support Multiple Languages (Future):

Would require:
1. Add language selector to frontend (`web/src/components/InterviewSetupForm.tsx`)
2. Pass language param in `POST /startAgent` request
3. Update backend to read language from request and configure STT/TTS accordingly
4. Add i18n for frontend UI strings (not currently implemented)

---

## Available Locales (Murf TTS Support)

Common locales Murf typically supports:
- `en-US` - English (United States) ✅ Currently used
- `en-GB` - English (United Kingdom)
- `en-IN` - English (India)
- `en-AU` - English (Australia)
- `fr-FR` - French (France)
- `de-DE` - German (Germany)
- `es-ES` - Spanish (Spain)
- `it-IT` - Italian (Italy)
- `pt-BR` - Portuguese (Brazil)
- `ja-JP` - Japanese (Japan)
- `zh-CN` - Mandarin Chinese (Simplified)

**Check Murf API docs for complete list and current availability.**

---

## STT Models and Language Support (Deepgram)

Current: `nova-3` (latest Deepgram model)

Deepgram supports **50+ languages** including:
- All major European languages
- Asian languages (Japanese, Mandarin, Korean, Hindi, etc.)
- African languages

**To change:** Update line 987 in `server/src/agent.py`
```python
stt = DeepgramSTT(model="nova-3", language="es")  # Spanish example
```

---

## Frontend UI Language

**Current Status:** ❌ NOT INTERNATIONALIZED

All UI text is hardcoded in English:
- `web/src/components/PublicLanding.tsx`
- `web/src/components/InterviewSetupForm.tsx`
- `web/src/components/AssessmentResults.tsx`
- All other React components

To support multiple UI languages would require:
1. Install i18n library (e.g., `next-i18n-router`, `i18next`)
2. Create translation files (`locales/en.json`, `locales/fr.json`, etc.)
3. Wrap text with i18n function calls
4. Add language switcher to UI
5. Test all pages in each language

---

## Summary

| Setting | Location | Current Value | Purpose |
|---------|----------|----------------|---------|
| **STT Language** | `server/src/agent.py:987` | `"en"` | Speech-to-text detection |
| **TTS Locale** | `server/.env` | `en-US` | Text-to-speech synthesis |
| **Voice IDs** | `server/.env` | Abhinav, Anisha, Alia | Persona voice selection |
| **LLM Language** | Hardcoded | English | Interview questions & assessment |
| **Frontend Language** | Hardcoded | English | UI text (not configurable) |

**Single-language implementation:** All components are English-only. Changing language requires code modifications + Murf/Deepgram API changes.

---

## Configuration Example: Switch to Spanish

To make Knotics run interviews in Spanish:

**1. Update `server/.env`:**
```bash
MURF_LOCALE=es-ES              # Spanish (Spain)
# or es-MX for Mexican Spanish
```

**2. Update `server/src/agent.py` (line 987):**
```python
stt = DeepgramSTT(model="nova-3", language="es")  # Spanish STT
```

**3. Verify Spanish voice availability:**
Check if selected voice IDs (Abhinav, Anisha, Alia) have Spanish equivalents, or update `server/.env`:
```bash
VOICE_TECHNICAL=voice_id_spanish_male
VOICE_PRODUCT=voice_id_spanish_female
VOICE_HIRING_MANAGER=voice_id_spanish_female
```

**4. Frontend remains English** (would need i18n implementation for UI translation)

---

**Note:** This is a single-language system. Full multilingual support would require significant refactoring to pass language preference through the entire stack (frontend → backend → Agora → LLM).
