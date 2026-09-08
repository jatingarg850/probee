'use client'

import { Briefcase, FileSearch, Filter, MapPin, RefreshCw, Search, Sparkles } from '@/components/ui/icons'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { JobDetailPanel } from '@/components/JobDetailPanel'
import { JobMatchCard } from '@/components/JobMatchCard'
import { SearchBar } from '@/components/SearchBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, PageContainer, PageHeader } from '@/components/ui/page'
import { useAuth } from '@/contexts/AuthContext'
import { authHeaders } from '@/lib/clientAuth'
import { loadResumeAnalysis } from '@/lib/resumeAnalysisCache'
import { matchJobs } from '@/services/api'
import type { MatchedJob, ResumeAnalysis, RoleJobs } from '@/types/resume'

export function OpportunitiesPage() {
  const { user } = useAuth()
  const [cached, setCached] = useState<{ analysis: ResumeAnalysis; savedAt: number } | null>(null)
  const [jobs, setJobs] = useState<RoleJobs>({})
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'jobs' | 'internships'>('jobs')
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all')
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<MatchedJob | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [location, setLocation] = useState<string>('India')

  useEffect(() => {
    if (!user?.id) return
    setCached(loadResumeAnalysis(user.id))
  }, [user?.id])

  const roles = cached?.analysis.best_suitable_roles ?? []

  const handleFetchAndMatchJobs = async (isInternship: boolean) => {
    if (roles.length === 0 || !cached) return

    const searchLocation = location.trim() || 'India'
    setIsLoadingJobs(true)
    setLoadError(null)
    setStatusMessage(`Pulling live ${isInternship ? 'internships' : 'roles'} in ${searchLocation}…`)
    try {
      const response = await fetch('/api/jobs/scrape', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          roles: roles.map((r) => r.role),
          location: searchLocation,
          is_internship: isInternship,
          results_per_role: 6,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }))
        setLoadError(error?.msg || error?.message || 'Could not fetch openings right now. Please try again.')
        return
      }

      const result = await response.json()

      if (result.code === 0 && result.data && Object.keys(result.data).length > 0) {
        const scrapedJobs = result.data as RoleJobs

        // Scraping only returns the raw listings — none of them carry a
        // `match` yet, so every card would otherwise fall back to
        // JobDetailPanel/JobMatchCard's hardcoded placeholder scores
        // (75/70/75/80/85/80, always identical, with an always-empty
        // strengths/missing_skills list) regardless of which job or whose
        // resume. This second call is what actually scores each listing
        // against the candidate's resume analysis. If it fails, the
        // listings themselves are still worth showing — better than
        // discarding real search results over a scoring hiccup — so this
        // degrades to the unscored jobs rather than failing the whole
        // fetch.
        setStatusMessage('Scoring openings against your resume…')
        try {
          const matched = await matchJobs(cached.analysis, scrapedJobs, 6)
          setJobs(matched)
        } catch (matchError) {
          console.error('Error scoring jobs against resume:', matchError)
          setJobs(scrapedJobs)
        }
      } else {
        setLoadError('No openings came back for those roles. Try again in a moment, or analyze your resume again.')
      }
    } catch (error) {
      console.error('Error in jobs flow:', error)
      setLoadError(
        error instanceof Error
          ? `Could not reach the job service: ${error.message}`
          : 'Could not reach the job service.',
      )
    } finally {
      setIsLoadingJobs(false)
      setStatusMessage('')
    }
  }

  // Flatten and sort all jobs by overall_match descending.
  const allRankedJobs = useMemo(() => {
    const list: MatchedJob[] =
      selectedRoleFilter === 'all' ? Object.values(jobs).flat() : (jobs[selectedRoleFilter] ?? [])

    return [...list].sort((a, b) => (b.match?.overall_match ?? 70) - (a.match?.overall_match ?? 70))
  }, [jobs, selectedRoleFilter])

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return allRankedJobs

    const query = searchQuery.toLowerCase()
    return allRankedJobs.filter(
      (job) =>
        job.title?.toLowerCase().includes(query) ||
        job.company?.toLowerCase().includes(query) ||
        job.location?.toLowerCase().includes(query) ||
        job.description?.toLowerCase().includes(query),
    )
  }, [allRankedJobs, searchQuery])

  const hasLoadedJobs = Object.keys(jobs).length > 0
  const totalJobCount = Object.values(jobs).reduce((a, b) => a + b.length, 0)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Get hired"
        title="Opportunities"
        description="Live openings pulled from LinkedIn and ranked against your resume — skills, experience, projects and stack, scored dimension by dimension."
        action={
          hasLoadedJobs ? (
            <Button
              onClick={() => handleFetchAndMatchJobs(activeTab === 'internships')}
              disabled={isLoadingJobs}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingJobs ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          ) : null
        }
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Analyze your resume first"
          description="Matching needs something to match against. Upload your resume once and every opening here gets scored on your real skills, experience and projects."
          action={
            <Button asChild>
              <Link href="/resume">
                <FileSearch className="h-4 w-4" />
                Analyze my resume
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Candidate context — what the ranking is grounded in. */}
          <Card className="animate-fade-up p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Ranked against your resume for
                  <strong className="font-semibold text-foreground">{cached?.analysis.target_role}</strong>
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Best-fit roles
                  </span>
                  {roles.map((r) => (
                    <Badge key={r.role} tone="neutral" className="bg-background">
                      {r.role}
                      <span className="font-semibold text-accent">{r.match_score}%</span>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <div className="group relative">
                  <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-accent" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleFetchAndMatchJobs(activeTab === 'internships')
                    }}
                    placeholder="Location"
                    aria-label="Search location"
                    className="h-9 w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 sm:w-36"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setActiveTab('jobs')
                      handleFetchAndMatchJobs(false)
                    }}
                    disabled={isLoadingJobs}
                    variant={activeTab === 'jobs' && hasLoadedJobs ? 'default' : 'outline'}
                    size="sm"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Find jobs
                  </Button>
                  <Button
                    onClick={() => {
                      setActiveTab('internships')
                      handleFetchAndMatchJobs(true)
                    }}
                    disabled={isLoadingJobs}
                    variant={activeTab === 'internships' && hasLoadedJobs ? 'default' : 'outline'}
                    size="sm"
                  >
                    <Briefcase className="h-3.5 w-3.5" />
                    Find internships
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/[0.07] px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          ) : null}

          {isLoadingJobs ? (
            <div className="flex animate-fade-up flex-col gap-4">
              <p className="text-center text-sm font-medium text-foreground">
                {statusMessage || 'Finding your matches…'}
              </p>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {['a', 'b', 'c', 'd'].map((key) => (
                  <Card key={key} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="skeleton h-4 w-3/4 rounded" />
                        <div className="skeleton h-3 w-1/2 rounded" />
                      </div>
                      <div className="skeleton h-6 w-14 shrink-0 rounded-full" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="skeleton h-5 w-20 rounded-full" />
                      <div className="skeleton h-5 w-24 rounded-full" />
                      <div className="skeleton h-5 w-16 rounded-full" />
                    </div>
                    <div className="skeleton h-8 w-32 self-end rounded-lg" />
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {!isLoadingJobs && hasLoadedJobs ? (
            <div className="flex animate-fade-up flex-col gap-4">
              <SearchBar
                placeholder="Search by title, company or location…"
                value={searchQuery}
                onChange={setSearchQuery}
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Role
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedRoleFilter('all')}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedRoleFilter === 'all'
                          ? 'border-transparent bg-ink text-ink-foreground'
                          : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground'
                      }`}
                    >
                      All ({totalJobCount})
                    </button>
                    {roles.map((r) => (
                      <button
                        key={r.role}
                        type="button"
                        onClick={() => setSelectedRoleFilter(r.role)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selectedRoleFilter === r.role
                            ? 'border-transparent bg-ink text-ink-foreground'
                            : 'border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground'
                        }`}
                      >
                        {r.role} ({jobs[r.role]?.length || 0})
                      </button>
                    ))}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground">
                  Showing <strong className="font-semibold text-foreground">{filteredJobs.length}</strong> of{' '}
                  {allRankedJobs.length}
                </span>
              </div>

              {filteredJobs.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Nothing matches that search"
                  description={`No opening mentions “${searchQuery}”.`}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {filteredJobs.map((job, idx) => (
                    <JobMatchCard
                      key={`${job.company}-${job.title}-${idx}`}
                      job={job}
                      onOpenDetails={(j) => setSelectedJobForDetails(j)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!isLoadingJobs && !hasLoadedJobs ? (
            <EmptyState
              icon={Search}
              title="Ready when you are"
              description="Hit “Find jobs” and we pull current openings for your best-fit roles, then score each one against your resume — strengths, gaps and shortlist odds."
            />
          ) : null}
        </>
      )}

      {selectedJobForDetails ? (
        <JobDetailPanel job={selectedJobForDetails} onClose={() => setSelectedJobForDetails(null)} />
      ) : null}
    </PageContainer>
  )
}
