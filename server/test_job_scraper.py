#!/usr/bin/env python3
"""
Quick test script for JobSpy integration
Run this to verify the job scraper works correctly
"""

from src.job_scraper import scrape_jobs_by_role, scrape_multiple_roles
import json

print("=" * 60)
print("JOB SCRAPER TEST")
print("=" * 60)

# Test 1: Single role
print("\n[TEST 1] Scraping single role...")
print("Role: Python Developer")
print("Location: United States")

jobs = scrape_jobs_by_role(
    role="Python Developer",
    location="United States",
    is_internship=False,
    results_wanted=5,
)

print(f"✓ Found {len(jobs)} jobs")
if jobs:
    print("\nFirst job:")
    print(json.dumps(jobs[0], indent=2, default=str))

# Test 2: Multiple roles
print("\n" + "=" * 60)
print("[TEST 2] Scraping multiple roles...")

roles_to_search = ["Python Developer", "Data Scientist"]
print(f"Roles: {roles_to_search}")
print("Location: United States")

all_jobs = scrape_multiple_roles(
    roles=roles_to_search,
    location="United States",
    is_internship=False,
    results_per_role=3,
)

for role, jobs in all_jobs.items():
    print(f"\n{role}: {len(jobs)} jobs found")
    if jobs:
        job = jobs[0]
        print(f"  • {job['title']}")
        print(f"  • {job['company']}")
        print(f"  • {job['location']}")
        print(f"  • Source: {job['site']}")
        if job.get('salary_min') or job.get('salary_max'):
            salary_str = f"${job.get('salary_min', '?')} - ${job.get('salary_max', '?')}"
            print(f"  • Salary: {salary_str}")

# Test 3: Internships
print("\n" + "=" * 60)
print("[TEST 3] Scraping internships...")
print("Role: Software Engineer Intern")
print("Location: United States")

internships = scrape_jobs_by_role(
    role="Software Engineer",
    location="United States",
    is_internship=True,
    results_wanted=5,
)

print(f"✓ Found {len(internships)} internships")
if internships:
    internship = internships[0]
    print(f"\nFirst internship:")
    print(f"  • {internship['title']}")
    print(f"  • {internship['company']}")
    print(f"  • {internship['job_type']}")

print("\n" + "=" * 60)
print("✓ All tests completed successfully!")
print("=" * 60)
