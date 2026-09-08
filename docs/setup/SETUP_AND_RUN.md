# Job Scraper Setup & Running Guide

## Quick Start (5 minutes)

### Prerequisites
- Python 3.10+
- Node.js / Bun
- Internet connection

### Step 1: Install Python Dependencies

```bash
cd server
pip install -r requirements.txt
```

This installs JobSpy and all required packages.

### Step 2: Start Backend Server

```bash
cd server
python -m uvicorn src.server:app --reload
```

Expected output:
```
INFO:     Will watch for changes in these directories: ['...']
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

### Step 3: Start Frontend (New Terminal)

```bash
cd web
npm run dev
```

Expected output:
```
> next dev
▲ Next.js [version]
- Local: http://localhost:3000
```

### Step 4: Test the App

1. Open http://localhost:3000 in your browser
2. Login/create account
3. Go to **Opportunities** page
4. (If first time) Analyze your resume
5. Click **"Find jobs"** - Real LinkedIn jobs will load!

## Testing the Scraper Directly

### Test 1: Run Test Script

```bash
cd server
python test_job_scraper.py
```

This will scrape jobs and internships and display results.

### Test 2: Test via API

```bash
curl -X POST http://localhost:8000/scrapeJobs \
  -H "Content-Type: application/json" \
  -d '{
    "roles": ["Python Developer"],
    "location": "United States",
    "is_internship": false,
    "results_per_role": 5
  }'
```

## How It Works

### Data Flow

```
User clicks "Find jobs"
    ↓
Frontend sends POST to /api/jobs/scrape
    ↓
Next.js API proxies to http://localhost:8000/scrapeJobs
    ↓
Python Backend calls scrape_multiple_roles()
    ↓
JobSpy scrapes LinkedIn (and other sources)
    ↓
Jobs returned as JSON with fields:
    - title
    - company
    - location
    - job_url (clickable link)
    - salary_min / salary_max
    - job_type
    - description
    ↓
Frontend displays jobs in card format
```

## Configuration

### Backend Settings (server/src/job_scraper.py)

```python
# Change default location
location: str = "United States"  # or "India", "UK", etc.

# Change default hours old filter
hours_old: int = 72  # Only jobs posted in last 72 hours

# Change results per role
results_per_role: int = 10  # Default to return 10 jobs per role
```

### Frontend Settings (web/src/components/OpportunitiesPage.tsx)

```javascript
// In scrapeJobs function:
body: JSON.stringify({
  location: 'United States',  // Change search location
  results_per_role: 10,       // Change number of results
  is_internship: false,       // Set to true for internships
})
```

## API Endpoint

### POST /scrapeJobs

**Request:**
```json
{
  "roles": ["Software Engineer", "Data Scientist"],
  "location": "United States",
  "is_internship": false,
  "results_per_role": 10
}
```

**Response:**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "Software Engineer": [
      {
        "title": "Senior Software Engineer",
        "company": "Google",
        "location": "San Francisco, CA",
        "job_url": "https://...",
        "salary_min": 150000,
        "salary_max": 200000,
        "salary_interval": "yearly",
        "job_type": "fulltime",
        "site": "linkedin",
        "description": "...",
        "is_remote": true
      },
      ...
    ]
  }
}
```

## Troubleshooting

### "ModuleNotFoundError: No module named 'jobspy'"

```bash
pip install python-jobspy
```

### "Connection refused" Error

Make sure backend is running on port 8000:
```bash
cd server
python -m uvicorn src.server:app --reload
```

### "No jobs found"

- Try different role name
- Check location spelling
- Wait 5 minutes and try again (rate limiting)
- Check browser console for error details

### Jobs showing "Untitled Position"

- Make sure backend has been restarted after any changes
- Check backend logs for errors
- Clear browser cache and refresh

### Slow Response (>30 seconds)

- Normal first time (LinkedIn needs time to respond)
- Subsequent searches are faster (cached)
- Reduce `results_per_role` if too slow

## File Structure

```
knotic/
├── server/
│   ├── src/
│   │   ├── job_scraper.py        ← Job scraping logic
│   │   ├── server.py              ← FastAPI endpoints
│   │   └── ...
│   ├── test_job_scraper.py        ← Test script
│   └── requirements.txt            ← Python dependencies
│
├── web/
│   ├── app/
│   │   └── api/
│   │       └── jobs/
│   │           └── scrape/
│   │               └── route.ts   ← API proxy
│   └── src/
│       └── components/
│           └── OpportunitiesPage.tsx  ← Job display UI
```

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Single role | 3-8s | First time, LinkedIn scrape |
| Multiple roles (3) | 10-30s | Sequential requests |
| Cached results | instant | Same browser session |
| Rate limited | wait 5-10min | If too many requests |

## Supported Locations

- United States
- India
- Canada
- United Kingdom
- Australia
- Germany
- France
- Japan
- And 30+ more countries

## Job Types

- `fulltime` - Full-time positions
- `parttime` - Part-time positions
- `internship` - Internship positions
- `contract` - Contract positions

## Next Steps

1. ✅ Start backend and frontend
2. ✅ Test with your resume
3. ✅ Apply to jobs directly
4. 🚀 Deploy to production

## Production Deployment

### Environment Variables

```bash
# .env
GEMINI_API_KEY=your-key-here
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
```

### Running in Production

**Backend:**
```bash
python -m uvicorn src.server:app --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
npm run build
npm run start
```

## Support

- **Logs**: Check browser console (Frontend) and terminal (Backend)
- **JobSpy Docs**: https://github.com/speedyapply/JobSpy
- **API Errors**: Check `/api/jobs/scrape` endpoint response

---

**Version**: 1.0  
**Last Updated**: September 1, 2026  
**Status**: Production Ready ✅
