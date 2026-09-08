# Job & Internship Scraper Setup

## Overview

The Knotic application now includes an integrated job and internship scraper powered by **JobSpy**, which aggregates job postings from multiple job boards (LinkedIn, Indeed, ZipRecruiter) with a single tool.

## Features

- **Multi-source scraping**: Searches LinkedIn, Indeed, and ZipRecruiter simultaneously
- **Smart filtering**: Finds jobs matching user's resume analysis results
- **Real-time display**: Shows job listings directly in the Opportunities page
- **Flexible search**: Supports both job and internship searches
- **Salary information**: Displays salary ranges when available

## Architecture

### Backend (Python)

**File**: `server/src/job_scraper.py`

The backend module provides two main functions:

```python
scrape_jobs_by_role(
    role: str,
    location: str = "India",
    is_internship: bool = False,
    results_wanted: int = 10,
    hours_old: int = 168
) -> list[dict]
```

Scrapes jobs for a single role from multiple job boards.

```python
scrape_multiple_roles(
    roles: list[str],
    location: str = "India",
    is_internship: bool = False,
    results_per_role: int = 5,
    hours_old: int = 168
) -> dict[str, list[dict]]
```

Scrapes jobs for multiple roles and returns results organized by role.

### API Endpoint

**Route**: `POST /scrapeJobs`

**Request Body**:
```json
{
  "roles": ["Software Engineer", "Product Manager"],
  "location": "United States",
  "is_internship": false,
  "results_per_role": 5
}
```

**Response**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "Software Engineer": [
      {
        "title": "Senior Software Engineer",
        "company": "Acme Corp",
        "location": "San Francisco, CA",
        "job_url": "https://...",
        "description": "We're looking for...",
        "job_type": "fulltime",
        "site": "linkedin",
        "salary_min": 150000,
        "salary_max": 200000,
        "salary_interval": "yearly"
      }
    ]
  }
}
```

### Frontend (React/TypeScript)

**Component**: `web/src/components/OpportunitiesPage.tsx`

The Opportunities page now:
1. Displays matched roles from resume analysis
2. Shows "Find jobs" and "Find internships" buttons
3. Fetches real job postings when buttons are clicked
4. Displays up to 3 job listings per role with:
   - Job title and company
   - Location and job type
   - Salary information (when available)
   - Direct links to job postings

**API Route**: `web/app/api/jobs/scrape/route.ts`

Proxies requests from the frontend to the Python backend, handling CORS and error management.

## Installation & Setup

### Prerequisites

1. **Python 3.10+** (required by JobSpy)
2. **Node.js/Bun** (for frontend)

### Step 1: Update Dependencies

Update Python requirements:
```bash
pip install -r server/requirements.txt
```

The `requirements.txt` now includes:
```
python-jobspy>=1.1.79
```

### Step 2: Configuration

The job scraper uses the same backend URL as other API calls. Ensure your `.env` file has:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

(This is typically already configured for the interview feature)

### Step 3: Start Services

Start the Python backend:
```bash
cd server
python -m uvicorn src.server:app --reload
```

Start the Next.js frontend:
```bash
cd web
npm run dev
```

### Step 4: Test

1. Navigate to http://localhost:3000/opportunities
2. If you haven't analyzed a resume yet, click "Analyze your resume"
3. After analysis, the page will show matched roles
4. Click "Find jobs" or "Find internships" to scrape real job listings

## Usage Flow

### User Flow

```
User uploads resume for analysis
    ↓
Resume analysis completes with matched roles
    ↓
Opportunities page displays matched roles
    ↓
User clicks "Find jobs" or "Find internships"
    ↓
Frontend calls /api/jobs/scrape
    ↓
Backend scrapes multiple job boards concurrently
    ↓
Results displayed in real-time with direct links
    ↓
User clicks job link to apply on job board site
```

### Example Interaction

1. Resume analyzed for: "Software Engineer"
2. Matched roles found: ["Software Engineer", "Senior Software Engineer", "DevOps Engineer"]
3. User clicks "Find jobs" for "Software Engineer"
4. Backend scrapes:
   - Indeed: 5 Software Engineer jobs
   - LinkedIn: 5 Software Engineer jobs
   - ZipRecruiter: 5 Software Engineer jobs
5. Top 3 results displayed per role
6. User can click directly to apply on the job board

## API Documentation

### Endpoint: POST /scrapeJobs

**Description**: Scrape jobs or internships for given roles

**Authentication**: None (public endpoint)

**Request Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `roles` | `string[]` | required | Job titles/roles to search for (max 10) |
| `location` | `string` | "United States" | Geographic location for job search |
| `is_internship` | `boolean` | false | Search for internships instead of jobs |
| `results_per_role` | `integer` | 5 | Results per role (max 20) |

**Response**:

```typescript
{
  code: number,           // 0 for success, non-zero for error
  msg: string,            // "success" or error description
  data?: {
    [role: string]: {
      title: string,
      company: string,
      location: string,
      job_url: string,
      description: string,
      job_type: string,           // fulltime, parttime, internship, contract
      site: string,               // indeed, linkedin, zip_recruiter
      salary_min?: number,
      salary_max?: number,
      salary_interval?: string    // yearly, hourly
    }[]
  }
}
```

## Performance Considerations

### Scraping Time

- Initial scrape per role: **5-15 seconds** (concurrent scraping from 3 sources)
- Multiple roles are scraped sequentially, not in parallel
- Results are cached in browser state while the page is open

### Rate Limiting

JobSpy handles rate limiting from job boards automatically:
- LinkedIn: Most restrictive, ~10 pages before rate limiting
- Indeed: Best performer, minimal rate limiting
- ZipRecruiter: Moderate rate limiting

If you hit rate limits:
1. Wait 5-10 minutes before retrying
2. Use different IP/location if available
3. Reduce `results_per_role` parameter

### Optimization Tips

1. **Limit roles per search**: Search for 3-5 roles at a time
2. **Reduce results**: Use `results_per_role: 5` (default) instead of 20
3. **Cache results**: Browser stores results until page refresh
4. **Stagger searches**: Wait between job/internship searches

## Troubleshooting

### Issue: No jobs found

**Possible causes**:
1. Rate limited by job boards (wait 5-10 minutes)
2. Invalid role name
3. No jobs match the search criteria in that location

**Solution**:
- Try with a different role name
- Change location parameter
- Check browser console for error details

### Issue: Slow response times

**Causes**:
1. First request always slower (concurrent scraping)
2. Multiple roles in single request
3. High job board load

**Solutions**:
- Reduce number of roles (search 3 at a time)
- Reduce `results_per_role`
- Try again during off-peak hours

### Issue: Backend connection error

**Cause**: Backend not running or wrong URL

**Solution**:
```bash
# Ensure backend is running
cd server
python -m uvicorn src.server:app --reload --host 0.0.0.0 --port 8000

# Check NEXT_PUBLIC_BACKEND_URL in web/.env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## Data Schema

### Job Object

Each job returned includes:

```typescript
interface Job {
  title: string              // e.g., "Senior Software Engineer"
  company: string            // e.g., "Google"
  location: string           // e.g., "San Francisco, CA"
  job_url: string            // Direct link to job posting
  description: string        // First 500 chars of job description
  job_type: string           // fulltime|parttime|internship|contract
  site: string               // Source: indeed|linkedin|zip_recruiter
  salary_min?: number        // Minimum salary in dollars
  salary_max?: number        // Maximum salary in dollars
  salary_interval?: string   // yearly|hourly|monthly|weekly
}
```

## Future Enhancements

Potential improvements:

1. **Job filtering**: Filter by salary range, job type, company
2. **Favorites**: Save favorite jobs locally
3. **Email alerts**: Notify when new jobs match criteria
4. **Background sync**: Refresh job listings in background
5. **More job boards**: Add Glassdoor, Google Jobs, Bayt, Naukri
6. **Advanced filters**: Remote only, date posted, company size
7. **Resume matching**: ML-based job recommendations
8. **Analytics**: Track applications and conversion

## Legal & Ethical Notes

- **Terms of Service**: Respect job board ToS when scraping
- **Rate Limiting**: JobSpy implements respectful rate limiting
- **User Agent**: Identifies itself properly to job boards
- **Data Privacy**: Job data is not stored persistently (only in session)
- **No spam**: Don't scrape and spam applications

## References

- [JobSpy GitHub](https://github.com/speedyapply/JobSpy)
- [JobSpy PyPI](https://pypi.org/project/python-jobspy/)
- [JobSpy Documentation](https://github.com/speedyapply/JobSpy/blob/main/README.md)

## Support

For issues related to:
- **Scraping logic**: Check `server/src/job_scraper.py`
- **API integration**: Check `web/app/api/jobs/scrape/route.ts`
- **Frontend display**: Check `web/src/components/OpportunitiesPage.tsx`
- **JobSpy library**: Visit [JobSpy GitHub](https://github.com/speedyapply/JobSpy)
