# ============================================================================
# Local Testing Startup Script
# ============================================================================
# This script starts both backend and frontend for local testing.
# 
# Prerequisites:
# 1. Python 3.9+ installed
# 2. Bun/Node.js installed
# 3. GEMINI_API_KEY and MURF_API_KEY set in server/.env.local
# 
# Usage:
#   PowerShell -ExecutionPolicy Bypass -File START_LOCAL.ps1
# ============================================================================

Write-Host "════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Agora Agent Handoff - Local Testing Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`n[1/4] Checking prerequisites..." -ForegroundColor Yellow

$pythonCheck = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python not found. Install Python 3.9+" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Python: $pythonCheck" -ForegroundColor Green

$bunCheck = bun --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Bun not found. Install Bun from https://bun.sh" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Bun: $bunCheck" -ForegroundColor Green

# Check environment variables
Write-Host "`n[2/4] Checking environment variables..." -ForegroundColor Yellow

if (-not (Test-Path "server\.env.local")) {
    Write-Host "❌ server/.env.local not found" -ForegroundColor Red
    exit 1
}

$envContent = Get-Content "server\.env.local" -Raw
if ($envContent -notmatch "GEMINI_API_KEY.*(?!your_gemini_api_key)") {
    Write-Host "⚠ GEMINI_API_KEY not configured in server/.env.local" -ForegroundColor Yellow
}
if ($envContent -notmatch "MURF_API_KEY.*(?!your_murf_api_key)") {
    Write-Host "⚠ MURF_API_KEY not configured in server/.env.local" -ForegroundColor Yellow
}
Write-Host "✓ Environment variables checked" -ForegroundColor Green

# Install backend dependencies
Write-Host "`n[3/4] Installing backend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "server\requirements.txt")) {
    Write-Host "❌ server/requirements.txt not found" -ForegroundColor Red
    exit 1
}

Push-Location server
python -m pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
Pop-Location

# Install frontend dependencies
Write-Host "`n[4/4] Installing frontend dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "web\package.json")) {
    Write-Host "❌ web/package.json not found" -ForegroundColor Red
    exit 1
}

Push-Location web
bun install --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
Pop-Location

# Display startup instructions
Write-Host "`n════════════════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Setup Complete!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════════════" -ForegroundColor Green

Write-Host @"

📋 NEXT STEPS:

1. Open THREE terminal windows:

   Terminal 1 (Backend):
   ──────────────────────
   cd server
   python -m uvicorn src.server:app --reload --port 8000

   Terminal 2 (Frontend):
   ──────────────────────
   cd web
   bun run dev

   Terminal 3 (Testing):
   ──────────────────────
   # Wait for both servers to start, then open browser

2. Open browser: http://localhost:3000

3. Test the agent:
   - Click "Start Call"
   - Speak to the agent
   - Agent responds with Murf TTS

════════════════════════════════════════════════════════════════════════

⚙ CONFIGURATION NOTES:

Backend URL:     http://localhost:8000
Frontend URL:    http://localhost:3000
LLM Endpoint:    http://localhost:8000/llm/chat/completions
STT:             Deepgram Nova-3 (managed by Agora)
TTS:             Murf AI (native vendor)
LLM:             Google Gemini

API Keys Required:
  • GEMINI_API_KEY   (from https://ai.google.dev/)
  • MURF_API_KEY     (from https://murf.ai/api/dashboard)

Current Status:
  • Agora Credentials: ✓ Set
  • GEMINI_API_KEY:   ? Check server/.env.local
  • MURF_API_KEY:     ? Check server/.env.local

════════════════════════════════════════════════════════════════════════

📚 More Info:

For detailed setup and troubleshooting, see LOCAL_SETUP.md

Happy testing!

"@
