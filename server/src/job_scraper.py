"""Job and internship scraper using JobSpy library."""

import logging
import re

import requests
from bs4 import BeautifulSoup
from jobspy import scrape_jobs

logger = logging.getLogger(__name__)

# Plain desktop UA — LinkedIn's public job pages (and most other boards)
# serve a stripped-down/blocked response to obvious bot/script user agents.
_SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_DESCRIPTION_REQUEST_TIMEOUT_SECONDS = 8
MAX_DESCRIPTION_CHARS = 6000

# Selectors tried in order, most specific first. LinkedIn's public job page
# renders the full posting inside one of the first two; other boards fall
# through to the generic <main>/<article> pass below.
_DESCRIPTION_SELECTORS = [
    ("div", {"class": "show-more-less-html__markup"}),  # LinkedIn (public view)
    ("div", {"class": "description__text"}),  # LinkedIn (alt layout)
    ("div", {"class": re.compile(r"job[-_]?description", re.I)}),
    ("section", {"class": re.compile(r"job[-_]?description", re.I)}),
    ("article", {}),
    ("main", {}),
]


def scrape_job_description(job_url: str) -> str:
    """Fetch a job posting's page and pull out the full description text.

    JobSpy's bulk listing call only carries a short summary (or nothing) for
    most sources, which isn't enough to ground an interview in what a
    specific role actually asks for. This is called on-demand — when a
    candidate clicks "Practice" on one listing — to pull the real posting
    text straight from the source page with BeautifulSoup, rather than
    guessing from the title alone.

    Best-effort: any failure (network, parsing, no match) returns an empty
    string so callers can fall back to whatever short description they
    already have instead of failing the whole request.
    """
    if not job_url or not job_url.strip():
        return ""

    try:
        response = requests.get(
            job_url,
            headers={"User-Agent": _SCRAPE_USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
            timeout=_DESCRIPTION_REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except Exception as exc:
        logger.warning("Failed to fetch job posting for description scrape url=%s: %s", job_url, exc)
        return ""

    try:
        soup = BeautifulSoup(response.text, "html.parser")

        # Strip elements that would otherwise pollute extracted text with
        # menu labels, tracking noise, or embedded scripts/styles.
        for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
            tag.decompose()

        container = None
        for tag_name, attrs in _DESCRIPTION_SELECTORS:
            container = soup.find(tag_name, attrs=attrs)
            if container is not None:
                break

        text = container.get_text(separator="\n", strip=True) if container else soup.get_text(separator="\n", strip=True)

        # Collapse the run of blank/whitespace-only lines page chrome tends
        # to leave behind once script/style tags are stripped.
        lines = [line.strip() for line in text.splitlines()]
        cleaned = "\n".join(line for line in lines if line)

        return cleaned[:MAX_DESCRIPTION_CHARS]
    except Exception as exc:
        logger.warning("Failed to parse job posting for description scrape url=%s: %s", job_url, exc)
        return ""


def scrape_jobs_by_role(
    role: str,
    location: str = "India",
    is_internship: bool = False,
    results_wanted: int = 10,
    hours_old: int = 72,
) -> list[dict]:
    """
    Scrape jobs or internships for a given role using JobSpy.
    
    Args:
        role: Job title/role to search for
        location: Location to search in
        is_internship: If True, searches for internships
        results_wanted: Number of results to retrieve
        hours_old: Only retrieve jobs posted within this many hours
        
    Returns:
        List of job postings as dictionaries
    """
    try:
        # Adjust search term for internships
        search_term = f"{role} intern" if is_internship else role
        
        logger.info(f"Scraping {'internships' if is_internship else 'jobs'} for {search_term} in {location}")
        
        # Use LinkedIn as primary source (most reliable)
        jobs_df = scrape_jobs(
            site_name=["linkedin"],
            search_term=search_term,
            location=location,
            results_wanted=results_wanted,
            hours_old=hours_old,
        )
        
        if jobs_df is None or jobs_df.empty:
            logger.warning(f"No jobs found for {search_term}")
            return []
        
        # Convert DataFrame to list of dictionaries
        jobs_list = []
        for _, row in jobs_df.iterrows():
            try:
                job = {
                    "title": str(row.get("title", "Untitled Position")).strip(),
                    "company": str(row.get("company", "Unknown Company")).strip(),
                    "location": str(row.get("location", "Location not specified")).strip(),
                    "job_url": str(row.get("job_url", "")).strip(),
                    "description": str(row.get("description", "")).strip() if row.get("description") else "",
                    "description_short": str(row.get("description", ""))[:300].strip() if row.get("description") else "",
                    "job_type": str(row.get("job_type", "fulltime")).lower().strip(),
                    "site": str(row.get("site", "linkedin")).lower().strip(),
                    "salary_min": row.get("min_amount"),
                    "salary_max": row.get("max_amount"),
                    "salary_interval": str(row.get("interval", "yearly")).lower().strip(),
                    "is_remote": row.get("is_remote", False),
                }
                # Only add if we have a title and company
                if job["title"] and job["title"] != "Untitled Position":
                    jobs_list.append(job)
            except Exception as e:
                logger.debug(f"Error processing job row: {str(e)}")
                continue
        
        logger.info(f"Found {len(jobs_list)} {'internships' if is_internship else 'jobs'} for {role}")
        return jobs_list
        
    except Exception as e:
        logger.error(f"Error scraping jobs for {role}: {str(e)}")
        return []


def scrape_multiple_roles(
    roles: list[str],
    location: str = "India",
    is_internship: bool = False,
    results_per_role: int = 10,
    hours_old: int = 72,
) -> dict[str, list[dict]]:
    """
    Scrape jobs for multiple roles.
    
    Args:
        roles: List of job titles/roles to search for
        location: Location to search in
        is_internship: If True, searches for internships
        results_per_role: Number of results to retrieve per role
        hours_old: Only retrieve jobs posted within this many hours
        
    Returns:
        Dictionary mapping role to list of job postings
    """
    results = {}
    
    for role in roles:
        jobs = scrape_jobs_by_role(
            role=role,
            location=location,
            is_internship=is_internship,
            results_wanted=results_per_role,
            hours_old=hours_old,
        )
        results[role] = jobs
    
    return results
