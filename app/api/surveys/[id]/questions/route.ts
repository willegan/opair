import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import type { QuestionType } from '@/lib/types/survey'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface CreateQuestionBody {
  type: QuestionType
  text: string
  order?: number
  required?: boolean
  options?: string[]
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: surveyId } = await params

  let body: Partial<CreateQuestionBody>
  try {
    body = (await request.json()) as Partial<CreateQuestionBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, text, order, required, options } = body

  if (!type || !['likert', 'free_text', 'multiple_choice'].includes(type)) {
    return NextResponse.json(
      { error: 'type must be one of: likert, free_text, multiple_choice' },
      { status: 400 }
    )
  }
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  if (type === 'multiple_choice') {
    if (!Array.isArray(options) || options.length < 2) {
      return NextResponse.json(
        { error: 'multiple_choice questions require at least 2 options' },
        { status: 400 }
      )
    }
  }

  const supabase = await createClient()

  // Check survey exists and is not active/closed
  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .select('id, status')
    .eq('id', surveyId)
    .single()

  if (surveyError || !survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }

  if (survey.status === 'active' || survey.status === 'closed') {
    return NextResponse.json(
      { error: 'Cannot modify questions on an active or closed survey' },
      { status: 409 }
    )
  }

  // Determine order_index: if not provided, append at end
  let orderIndex = order ?? 0
  if (order === undefined) {
    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', surveyId)
    orderIndex = (count ?? 0)
  }

  const { data, error } = await supabase
    .from('questions')
    .insert({
      survey_id: surveyId,
      type,
      text: text.trim(),
      order_index: orderIndex,
      required: required ?? true,
      options: type === 'multiple_choice' ? options : null,
    })
    .select('id, survey_id, type, text, options, order_index, required, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
