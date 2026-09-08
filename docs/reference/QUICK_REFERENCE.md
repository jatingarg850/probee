# Job Scraper - Quick Reference Card

## 🚀 Start Here

```bash
# Terminal 1: Backend
cd server
python -m uvicorn src.server:app --reload

# Terminal 2: Frontend  
cd web
npm run dev

# Then open: http://localhost:3000
```

## 📍 What It Does

```
Resume Analysis → Matched Roles → Click "Find jobs" → Real LinkedIn Jobs
```

## 🔧 Key Components

| File | Purpose | Lines |
|------|---------|-------|
| `server/src/job_scraper.py` | Scraping logic | 105 |
| `server/src/server.py` | /scrapeJobs endpoint | +40 |
| `web/app/api/jobs/scrape/route.ts` | API proxy | 44 |
| `web/src/components/OpportunitiesPage.tsx` | UI display | +200 |

## 💡 How It Works

```python
# Backend (Python)
from jobspy import scrape_jobs

jobs = scrape_jobs(
    site_name=["linkedin"],
    search_term="Python Developer",
    location="United States",
    results_wanted=10,
    hours_old=72,
)
```

## 📊 Job Data Returned

```json
{
  "title": "Senior Software Engineer",
  "company": "Google",
  "location": "San Francisco, CA",
  "job_url": "https://linkedin.com/jobs/...",
  "salary_min": 180000,
  "salary_max": 220000,
  "salary_interval": "yearly",
  "job_type": "fulltime",
  "site": "linkedin",
  "is_remote": true
}
```

## ⚡ Performance

| Operation | Time |
|-----------|------|
| 1 role | 3-8s |
| 3 roles | 10-30s |
| Cached | instant |

## 🛠️ Configuration

**Location:**
```javascript
// web/src/components/OpportunitiesPage.tsx
location: 'United States'  // Change here
```

**Results per role:**
```javascript
results_per_role: 10  // Default: 10
```

**Hours old filter:**
```python
# server/src/job_scraper.py
hours_old: int = 72  # Default: 3 days
```

## 🧪 Testing

```bash
# Test script
cd server
python test_job_scraper.py

# Direct API test
curl -X POST http://localhost:8000/scrapeJobs \
  -H "Content-Type: application/json" \
  -d '{"roles":["Python Developer"],"location":"United States"}'
```

## ❌ Troubleshooting

| Problem | Solution |
|---------|----------|
| "No module jobspy" | `pip install python-jobspy` |
| "Connection refused" | Start backend on port 8000 |
| "No jobs found" | Try different role name |
| Slow (>30s) | Normal first time, try again |
| Blank cards | Refresh page, restart backend |

## 📚 Documentation

- **Getting Started**: `SETUP_AND_RUN.md`
- **Quick Start**: `JOB_SCRAPER_QUICK_START.md`
- **Full Details**: `JOB_SCRAPER_SETUP.md`
- **Architecture**: `JOB_SCRAPER_ARCHITECTURE.md`
- **Testing**: `JOB_SCRAPER_TESTING_GUIDE.md`

## 🔗 API Reference

### POST /scrapeJobs

**Request:**
```json
{
  "roles": ["Python Developer"],
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
    "Python Developer": [{ job }, { job }, ...]
  }
}
```

## 📱 Supported Locations

- United States
- India
- Canada
- United Kingdom
- Australia
- Germany
- France
- And 30+ more

## 👷 Job Types

- `fulltime` - Full-time work
- `parttime` - Part-time work
- `internship` - Internships
- `contract` - Contract work

## 🎯 User Flow

```
1. Login to app
2. Go to "Opportunities"
3. (First time) Analyze resume
4. See matched roles with % match
5. Click "Find jobs" or "Find internships"
6. Real jobs load from LinkedIn
7. Click job → Opens LinkedIn apply page
```

## 🔒 Security

✅ Input validation  
✅ No data persistence  
✅ Error handling  
✅ Rate limiting (automatic)  
✅ CORS protected  

## 📦 Dependencies

Main: `python-jobspy>=1.1.79`

Included with JobSpy:
- pandas
- beautifulsoup4
- requests
- playwright
- pydantic

## 🌐 Deployment

```bash
# Build
npm run build

# Production backend
python -m uvicorn src.server:app --host 0.0.0.0

# Production frontend
npm run start
```

## 📋 Checklist

- [ ] Backend running on port 8000
- [ ] Frontend running on port 3000
- [ ] Can analyze resume
- [ ] Can find jobs
- [ ] Jobs show title, company, location
- [ ] Can click jobs to apply
- [ ] Internship search works

## 🎓 Learn More

- JobSpy Docs: https://github.com/speedyapply/JobSpy
- FastAPI: https://fastapi.tiangolo.com
- Next.js: https://nextjs.org

## 💬 Commands Summary

```bash
# Start backend
cd server && python -m uvicorn src.server:app --reload

# Start frontend
cd web && npm run dev

# Test scraper
cd server && python test_job_scraper.py

# Build for production
cd web && npm run build

# Production start
cd web && npm run start
```

---

**Everything you need to know on one page!**  
**Status**: ✅ Production Ready  
**Version**: 1.0  
**Last Updated**: Sept 1, 2026
