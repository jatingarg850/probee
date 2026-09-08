export type FlowNodeType = 'input' | 'skill' | 'experience' | 'decision' | 'role'

export interface FlowNode {
  id: string
  type: FlowNodeType
  label: string
  detail: string
}

export interface FlowEdge {
  from: string
  to: string
  label: string
}

export interface ResumeFlow {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface RoleFitVerdict {
  verdict: 'strong' | 'moderate' | 'weak'
  score: number
  reasoning: string
}

export interface SuitableRole {
  role: string
  match_score: number
  reasoning: string
}

/** Result of POST /api/analyzeResume. */
export interface ResumeAnalysis {
  candidate_summary: string
  target_role: string
  target_role_fit: RoleFitVerdict
  experience_years_estimate: number | null
  top_skills: string[]
  strengths: string[]
  gaps: string[]
  best_suitable_roles: SuitableRole[]
  flow: ResumeFlow
  error?: boolean
  error_message?: string
  /** 'validation' means the input itself was the problem (unreadable
   * resume, nonsense target role) — worth blocking on and asking the user
   * to fix. 'system' means a transient failure on the analysis call itself
   * (e.g. the model API hiccuped) — safe to treat as non-fatal and proceed
   * without the resume context. */
  error_type?: 'validation' | 'system'
}

export interface CompanyInsights {
  size_estimate: string
  interview_pattern: string[]
  commonly_asked: string[]
  difficulty: number // 1 to 5
}

export interface JobMatchReport {
  overall_match: number // 0-100
  skill_match: number
  experience_match: number
  education_match: number
  project_match: number
  tech_stack_match: number
  soft_skill_match: number
  strengths: string[]
  missing_skills: string[]
  resume_improvements: string[]
  suggestions: string[]
  recommendation: string
  difficulty: 'Easy Apply' | 'Moderate' | 'Competitive' | 'High Reach' | string
  interview_probability: number // 0-100
  company_insights: CompanyInsights
}

export interface MatchedJob {
  title: string
  company: string
  location: string
  job_url: string
  description?: string
  description_short?: string
  job_type?: string
  site?: string
  salary_min?: number
  salary_max?: number
  salary_interval?: string
  is_remote?: boolean
  match?: JobMatchReport
}

export type RoleJobs = Record<string, MatchedJob[]>
