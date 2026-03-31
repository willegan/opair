import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import { getDescendantIds } from '@/lib/departments'
import type { Department } from '@/lib/types/department'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ANONYMITY_THRESHOLD = 5

interface LikertQuestionResult {
  question_id: string
  text: string
  type: 'likert'
  mean: number
  distribution: Record<string, number>
  response_count: number
}

interface FreeTextQuestionResult {
  question_id: string
  text: string
  type: 'free_text'
  responses: string[]
  response_count: number
}

interface MultipleChoiceQuestionResult {
  question_id: string
  text: string
  type: 'multiple_choice'
  distribution: Record<string, number>
  response_count: number
}

type QuestionResult =
  | LikertQuestionResult
  | FreeTextQuestionResult
  | MultipleChoiceQuestionResult

interface DepartmentBreakdownItem {
  department_id: string
  department_name: string
  response_count: number
  overall_score?: number
  hidden: boolean
}

interface AnalyticsResponse {
  survey_id: string
  total_invited: number
  total_responded: number
  response_rate: number
  overall_engagement_score: number
  questions: QuestionResult[]
  by_department: DepartmentBreakdownItem[]
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Require admin auth
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: surveyId } = await params
  const { searchParams } = new URL(request.url)
  const departmentIdFilter = searchParams.get('department_id')

  const admin = createAdminClient()

  // ------------------------------------------------------------------
  // 1. Verify survey exists
  // ------------------------------------------------------------------
  const { data: survey, error: surveyError } = await admin
    .from('surveys')
    .select('id, title, status, open_date, close_date')
    .eq('id', surveyId)
    .single()

  if (surveyError || !survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }

  // ------------------------------------------------------------------
  // 2. Resolve department filter — collect allowed department IDs
  // ------------------------------------------------------------------
  let allowedDeptIds: string[] | null = null // null = no filter

  if (departmentIdFilter) {
    const { data: allDepts, error: deptsError } = await admin
      .from('departments')
      .select('id, name, parent_id, created_at')

    if (deptsError) {
      return NextResponse.json({ error: deptsError.message }, { status: 500 })
    }

    allowedDeptIds = getDescendantIds(
      (allDepts ?? []) as Department[],
      departmentIdFilter
    )
  }

  // ------------------------------------------------------------------
  // 3. Count invited (all tokens for this survey)
  // ------------------------------------------------------------------
  const { count: totalInvited, error: invitedError } = await admin
    .from('participation_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId)

  if (invitedError) {
    return NextResponse.json({ error: invitedError.message }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 4. Count responded (tokens with used_at set)
  // ------------------------------------------------------------------
  const { count: totalResponded, error: respondedError } = await admin
    .from('participation_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId)
    .not('used_at', 'is', null)

  if (respondedError) {
    return NextResponse.json({ error: respondedError.message }, { status: 500 })
  }

  const invited = totalInvited ?? 0
  const responded = totalResponded ?? 0

  // ------------------------------------------------------------------
  // 5. Load questions (ordered)
  // ------------------------------------------------------------------
  const { data: questions, error: questionsError } = await admin
    .from('questions')
    .select('id, text, type, options, order_index, required')
    .eq('survey_id', surveyId)
    .order('order_index')

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 6. Load responses (optionally filtered by department)
  // ------------------------------------------------------------------
  let responsesQuery = admin
    .from('responses')
    .select('question_id, answer, department_id')
    .eq('survey_id', surveyId)

  if (allowedDeptIds && allowedDeptIds.length > 0) {
    responsesQuery = responsesQuery.in('department_id', allowedDeptIds)
  }

  const { data: responses, error: responsesError } = await responsesQuery

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 })
  }

  // Check anonymity threshold if filtered
  if (departmentIdFilter) {
    const uniqueDepts = new Set((responses ?? []).map((r: { department_id: string }) => r.department_id))
    const totalFilteredResponses = new Set(
      (responses ?? []).map((r: { question_id: string; department_id: string }) => r.department_id + r.question_id)
    ).size
    // Use count of responses for the smallest unit
    if ((responses ?? []).length === 0) {
      return NextResponse.json({
        hidden: true,
        reason: 'anonymity_threshold',
        message: 'Fewer than 5 responses in this department scope',
      } as const)
    }
    // Estimate unique respondents from response count / question count
    const questionCount = (questions ?? []).length
    if (questionCount > 0) {
      const estimatedRespondents = Math.round((responses ?? []).length / questionCount)
      if (estimatedRespondents < ANONYMITY_THRESHOLD) {
        return NextResponse.json({
          hidden: true,
          reason: 'anonymity_threshold',
          message: 'Fewer than 5 responses in this department scope',
        } as const)
      }
    }
    void uniqueDepts
    void totalFilteredResponses
  }

  // ------------------------------------------------------------------
  // 7. Aggregate per-question results
  // ------------------------------------------------------------------
  const responsesByQuestion = new Map<string, string[]>()
  for (const r of (responses ?? []) as { question_id: string; answer: string; department_id: string }[]) {
    const existing = responsesByQuestion.get(r.question_id) ?? []
    existing.push(r.answer)
    responsesByQuestion.set(r.question_id, existing)
  }

  const questionResults: QuestionResult[] = []
  const likertMeans: number[] = []

  for (const q of (questions ?? []) as { id: string; text: string; type: string; options: string[] | null; order_index: number; required: boolean }[]) {
    const answers = responsesByQuestion.get(q.id) ?? []

    if (q.type === 'likert') {
      const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      let sum = 0

      for (const a of answers) {
        const val = parseInt(a, 10)
        if (val >= 1 && val <= 5) {
          dist[String(val)] = (dist[String(val)] ?? 0) + 1
          sum += val
        }
      }

      const mean = answers.length > 0 ? Math.round((sum / answers.length) * 100) / 100 : 0
      if (answers.length > 0) likertMeans.push(mean)

      questionResults.push({
        question_id: q.id,
        text: q.text,
        type: 'likert',
        mean,
        distribution: dist,
        response_count: answers.length,
      })
    } else if (q.type === 'free_text') {
      questionResults.push({
        question_id: q.id,
        text: q.text,
        type: 'free_text',
        responses: answers,
        response_count: answers.length,
      })
    } else if (q.type === 'multiple_choice') {
      const dist: Record<string, number> = {}
      for (const a of answers) {
        dist[a] = (dist[a] ?? 0) + 1
      }
      questionResults.push({
        question_id: q.id,
        text: q.text,
        type: 'multiple_choice',
        distribution: dist,
        response_count: answers.length,
      })
    }
  }

  // Overall engagement score = mean of Likert question means
  const overallEngagementScore =
    likertMeans.length > 0
      ? Math.round((likertMeans.reduce((a, b) => a + b, 0) / likertMeans.length) * 100) / 100
      : 0

  // ------------------------------------------------------------------
  // 8. Department breakdown
  // ------------------------------------------------------------------
  const { data: allDepts, error: allDeptsError } = await admin
    .from('departments')
    .select('id, name')

  if (allDeptsError) {
    return NextResponse.json({ error: allDeptsError.message }, { status: 500 })
  }

  const deptMap = new Map<string, string>()
  for (const d of (allDepts ?? []) as { id: string; name: string }[]) {
    deptMap.set(d.id, d.name)
  }

  // Aggregate responses by department
  const responsesByDept = new Map<string, { total: number; likertSum: number; likertCount: number }>()

  for (const r of (responses ?? []) as { question_id: string; answer: string; department_id: string }[]) {
    const existing = responsesByDept.get(r.department_id) ?? { total: 0, likertSum: 0, likertCount: 0 }
    existing.total += 1

    // Check if this question is likert
    const q = (questions ?? []).find((q: { id: string; type: string }) => q.id === r.question_id)
    if (q?.type === 'likert') {
      const val = parseInt(r.answer, 10)
      if (!isNaN(val) && val >= 1 && val <= 5) {
        existing.likertSum += val
        existing.likertCount += 1
      }
    }

    responsesByDept.set(r.department_id, existing)
  }

  // Estimate respondent count per department (responses / questions)
  const questionCount = (questions ?? []).length

  const byDepartment: DepartmentBreakdownItem[] = []
  for (const [deptId, stats] of responsesByDept.entries()) {
    const respondentEstimate = questionCount > 0
      ? Math.round(stats.total / questionCount)
      : 0

    const hidden = respondentEstimate < ANONYMITY_THRESHOLD

    byDepartment.push({
      department_id: deptId,
      department_name: deptMap.get(deptId) ?? 'Unknown',
      response_count: respondentEstimate,
      ...(hidden
        ? { hidden: true }
        : {
            hidden: false,
            overall_score:
              stats.likertCount > 0
                ? Math.round((stats.likertSum / stats.likertCount) * 100) / 100
                : 0,
          }),
    })
  }

  // Sort by response_count desc
  byDepartment.sort((a, b) => b.response_count - a.response_count)

  // ------------------------------------------------------------------
  // 9. Build and return response
  // ------------------------------------------------------------------
  const result: AnalyticsResponse = {
    survey_id: surveyId,
    total_invited: invited,
    total_responded: responded,
    response_rate: invited > 0 ? Math.round((responded / invited) * 1000) / 1000 : 0,
    overall_engagement_score: overallEngagementScore,
    questions: questionResults,
    by_department: byDepartment,
  }

  return NextResponse.json(result)
}
