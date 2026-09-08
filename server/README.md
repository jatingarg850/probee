# Agora Agent Backend — Agent Handoff Recipe

FastAPI service that owns Agora token generation and agent session lifecycle for
the handoff recipe. It is the service the web client reaches through the Next.js
`/api/*` rewrite proxy (port 8000).

## What's different from the base quickstart

The LLM stage uses the SDK's `CustomLLM` vendor instead of a managed
`OpenAI(model="gpt-4o-mini")`. It points the agent at your own OpenAI-compatible
concierge endpoint (the `llm/` server in this repo) via `CUSTOM_LLM_URL`. STT
(Deepgram) and TTS (MiniMax) remain Agora-managed.

## Run

Use the repo-root `README.md` for the full local flow (`bun run dev`). To work on
this module directly:

The root commands below select the correct virtualenv interpreter on macOS,
Linux, and Windows, so activation is not required:

```shell
bun run setup:server
bun run backend
```

## Environment

`server/.env.example` is the template. Required:

- `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` — Agora project credentials.
- `CUSTOM_LLM_URL` — the **public** chat-completions URL of your `llm/` endpoint
  (e.g. `https://<tunnel>/chat/completions`). Agora cloud calls this directly, so
  it cannot be `localhost`.
- `CUSTOM_LLM_API_KEY` — forwarded by Agora cloud as `Authorization: Bearer`.
  Required by the `CustomLLM` vendor.

Optional: `CUSTOM_LLM_MODEL` (default `handoff-mock`), `AGENT_GREETING`,
`PORT` (default `8000`).

## API

- `GET /get_config` — token + channel/UID config
- `POST /startAgent` — start an agent session
- `POST /stopAgent` — stop an agent session

The repo-root `bun run verify:local:fastapi` exercises these routes through the
Next proxy using a fake agent (`scripts/run_fake_server.py`), so no live Agora
session is required.
