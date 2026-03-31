import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Escape a value for CSV — wrap in quotes if it contains commas, quotes, or newlines
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(',')
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: surveyId } = await params

  const admin = createAdminClient()

  // Verify survey exists
  const { data: survey, error: surveyError } = await admin
    .from('surveys')
    .select('id, title')
    .eq('id', surveyId)
    .single()

  if (surveyError || !survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }

  // Fetch questions ordered by order_index
  const { data: questions, error: questionsError } = await admin
    .from('questions')
    .select('id, text, type, options, order_index')
    .eq('survey_id', surveyId)
    .order('order_index')

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 })
  }

  // Fetch all responses for this survey
  const { data: responses, error: responsesError } = await admin
    .from('responses')
    .select('question_id, answer')
    .eq('survey_id', surveyId)

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 })
  }

  // Group responses by question_id
  const responsesByQuestion = new Map<string, string[]>()
  for (const r of responses ?? []) {
    const existing = responsesByQuestion.get(r.question_id) ?? []
    existing.push(r.answer)
    responsesByQuestion.set(r.question_id, existing)
  }

  // Build CSV rows
  const rows: string[] = []

  // Headers: fixed columns + note that multiple_choice adds extra option columns
  rows.push(csvRow([
    'question_text',
    'question_type',
    'mean_score',
    'response_count',
    '1_count',
    '2_count',
    '3_count',
    '4_count',
    '5_count',
  ]))

  for (const q of questions ?? []) {
    const answers = responsesByQuestion.get(q.id) ?? []
    const count = answers.length

    if (q.type === 'likert') {
      const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      let sum = 0
      for (const a of answers) {
        const n = parseInt(a, 10)
        if (n >= 1 && n <= 5) {
          dist[String(n)] = (dist[String(n)] ?? 0) + 1
          sum += n
        }
      }
      const mean = count > 0 ? (sum / count).toFixed(2) : ''
      rows.push(csvRow([
        q.text,
        q.type,
        mean,
        count,
        dist['1'],
        dist['2'],
        dist['3'],
        dist['4'],
        dist['5'],
      ]))
    } else if (q.type === 'free_text') {
      // Free text: count only — no individual responses exported (anonymity)
      rows.push(csvRow([
        q.text,
        q.type,
        '', // no mean
        count,
        '', '', '', '', '', // no distribution
      ]))
    } else if (q.type === 'multiple_choice') {
      // Aggregate option distribution
      const options = Array.isArray(q.options) ? (q.options as string[]) : []
      const dist: Record<string, number> = {}
      for (const opt of options) dist[opt] = 0
      for (const a of answers) {
        if (Object.prototype.hasOwnProperty.call(dist, a)) {
          dist[a] = (dist[a] ?? 0) + 1
        }
      }
      // For multiple_choice: append option distribution as extra columns after the fixed ones
      // Format: question_text, question_type, '', response_count, then option:count pairs
      const optionCells = options.map((opt) => `${opt}:${dist[opt] ?? 0}`)
      rows.push(csvRow([
        q.text,
        q.type,
        '', // no mean
        count,
        '', '', '', '', '', // empty likert distribution columns
        ...optionCells,
      ]))
    }
  }

  const csvContent = rows.join('\r\n') + '\r\n'

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-${surveyId}-results.csv"`,
    },
  })
}
