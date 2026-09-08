# Deployment Verification Checklist

## Quick Status Check

### ✅ Completed
- [x] **NEXT_PUBLIC_BACKEND_URL configured** in `web/.env`
  - Set to: `http://200.97.169.116:8000`
- [x] **Scrape route enhanced** with logging & error handling
  - File: `web/app/api/jobs/scrape/route.ts`
- [x] **Frontend error messages improved** with better feedback
  - File: `web/src/components/OpportunitiesPage.tsx`

### ⏳ To Verify

#### Task #3: Backend Server Running on Port 8000

**Backend Configuration:**
- Language: Python with FastAPI
- Port: 8000 (configurable via `PORT` env var)
- Entry point: `server/src/server.py`
- Start command: `python src/server.py`

**Verification on Backend Server (SSH to 200.97.169.116):**

```bash
# Check if port 8000 is listening
netstat -tlnp | grep 8000
# or
lsof -i :8000

# Expected output:
# tcp    0    0 0.0.0.0:8000    0.0.0.0:*    LISTEN    <PID>/python

# Check if backend process is running
ps aux | grep "python src/server.py"

# Test the /scrapeJobs endpoint
curl -X POST http://localhost:8000/scrapeJobs \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["Software Engineer"],
    "location": "India",
    "is_internship": false,
    "results_per_role": 3
  }'

# Expected response:
# {"code":0,"msg":"success","data":{"Software Engineer":[...]}}
```

**To start backend (if not running):**

```bash
cd /path/to/knotic/server
python src/server.py
# or with specific port
PORT=8000 python src/server.py
```

**To verify in systemd (if set up as service):**

```bash
systemctl status knotic-backend
systemctl restart knotic-backend
journalctl -u knotic-backend -f
```

#### Task #4: Network Connectivity Between Frontend & Backend

**From Frontend Server (SSH to 200.97.169.116):**

```bash
# Test connectivity to backend on port 8000
curl -v http://200.97.169.116:8000/scrapeJobs \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"roles":["Engineer"]}'

# Expected: Connection successful, JSON response

# Check firewall rules
iptables -L -n | grep 8000

# Test DNS resolution (if using domain instead of IP)
nslookup knotic.coddyio.tech
ping 200.97.169.116
```

**Network Connectivity Checklist:**
- [ ] Backend server running: `ps aux | grep "python src/server.py"`
- [ ] Port 8000 open: `netstat -tlnp | grep 8000`
- [ ] Firewall allows 8000: `iptables -L -n | grep 8000` (should allow from frontend)
- [ ] Direct connection works: `curl http://200.97.169.116:8000/scrapeJobs`
- [ ] Frontend can reach backend: Test from frontend server same curl command

## End-to-End Testing

### Test 1: Backend Direct (Backend Server)
```bash
# SSH into 200.97.169.116
curl -X POST http://localhost:8000/scrapeJobs \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["Python Developer", "Frontend Engineer"],
    "location": "India",
    "is_internship": false,
    "results_per_role": 5
  }'
```

**Expected:** Returns jobs in JSON format

### Test 2: Frontend to Backend (Frontend Server)
```bash
# SSH into frontend server
curl -X POST http://200.97.169.116:8000/scrapeJobs \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["Data Scientist"],
    "location": "India",
    "is_internship": false,
    "results_per_role": 5
  }'
```

**Expected:** Returns jobs in JSON format

### Test 3: Through Next.js API Route (Frontend Server)
```bash
# SSH into frontend server or test from browser
curl -X POST http://localhost:3000/api/jobs/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["Product Manager"],
    "location": "India",
    "is_internship": false,
    "results_per_role": 5
  }'
```

**Expected:** Returns jobs in JSON format, can see `[Job Scrape]` logs

### Test 4: Through Web UI (Browser)
1. Navigate to `https://knotic.coddyio.tech`
2. Login or create account
3. Go to Opportunities section
4. Upload/analyze a resume first
5. Click "Find Jobs & Match" button
6. Watch browser console for:
   - Network requests to `/api/jobs/scrape`
   - `[Job Scrape]` log entries
   - Response showing job listings

## Debugging Common Issues

### Issue: 404 on /api/jobs/scrape
**Cause:** Endpoint not implemented or route misconfigured
**Fix:** 
- Verify `web/app/api/jobs/scrape/route.ts` exists
- Check Next.js is restarted after file creation
- Check file is in correct path (not typo in naming)

### Issue: Backend returning 404 at /scrapeJobs
**Cause:** Backend not running or endpoint missing
**Fix:**
- Verify `server/src/server.py` exists
- Check backend is running: `ps aux | grep server.py`
- Check port: `netstat -tlnp | grep 8000`
- Check logs for errors during startup

### Issue: 503 - Backend Unreachable
**Cause:** Network/firewall blocking connection
**Fix:**
- Check firewall: `iptables -L -n | grep 8000`
- Check connectivity: `curl http://200.97.169.116:8000/`
- Check IP/port in `.env` matches actual backend address
- Check no proxy intercepting requests

### Issue: Timeout during scraping
**Cause:** Job scraping takes too long (common with LinkedIn)
**Fix:**
- Increase timeout in scrape route (currently 60s)
- Reduce `results_per_role` parameter
- Check backend not blocked/rate-limited by JobSpy sources
- Check backend logs for scraping errors

### Issue: 500 Error with "JobSpy" error
**Cause:** JobSpy library error, usually LinkedIn blocking
**Fix:**
- Check backend logs: `journalctl -u knotic-backend -f`
- This is expected - LinkedIn aggressively blocks scrapers
- Consider reducing roles, locations, or results requested
- Wait before retrying (LinkedIn rate limits)

## Environment Variables Reference

### Backend (server/.env)
```env
# Port server listens on
PORT=8000

# Required for job scraping
GEMINI_API_KEY=<your-key>
```

### Frontend (web/.env)
```env
# Must point to backend server
NEXT_PUBLIC_BACKEND_URL=http://200.97.169.116:8000
```

## File Locations

```
Frontend API Route:
  web/app/api/jobs/scrape/route.ts

Backend Endpoint:
  server/src/server.py (POST /scrapeJobs)

Backend Scraper:
  server/src/job_scraper.py

Frontend Component:
  web/src/components/OpportunitiesPage.tsx
```

## Logs to Monitor

### Frontend Logs
```bash
# Next.js server logs (look for [Job Scrape] prefix)
# Usually in stdout or systemd journal
grep -i "job scrape" /var/log/knotic-web.log
```

### Backend Logs
```bash
# Python backend logs
journalctl -u knotic-backend -f
# or
tail -f /var/log/knotic-backend.log

# Look for:
# - "Scraping jobs for"
# - Error messages from JobSpy
# - Exception tracebacks
```

## Success Criteria

✅ **Job scraping is working when:**
1. Browser shows "Displaying X jobs from LinkedIn" message
2. Job cards populate with real LinkedIn listings
3. No 404 or 503 errors in console
4. Backend logs show successful scraping
5. Frontend logs show successful backend connection

## Support

If issues persist:
1. Check both server logs (frontend and backend)
2. Test each layer independently (backend → frontend → browser)
3. Verify network connectivity with curl tests
4. Check environment variables are correct
5. Restart both services after config changes

