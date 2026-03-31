import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import type { QuestionType } from '@/lib/types/survey'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface UpdateQuestionBody {
  type?: QuestionType
  text?: string
  order?: number
  required?: boolean
  options?: string[]
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: questionId } = await params

  let body: Partial<UpdateQuestionBody>
  try {
    body = (await request.json()) as Partial<UpdateQuestionBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch the question to verify it exists and get its survey
  const { data: question, error: fetchError } = await supabase
    .from('questions')
    .select('id, survey_id, type')
    .eq('id', questionId)
    .single()

  if (fetchError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  // Verify the survey is not active/closed
  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .select('id, status')
    .eq('id', question.survey_id)
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

  // Build updates object
  const updates: Record<string, unknown> = {}

  if (body.type !== undefined) {
    if (!['likert', 'free_text', 'multiple_choice'].includes(body.type)) {
      return NextResponse.json(
        { error: 'type must be one of: likert, free_text, multiple_choice' },
        { status: 400 }
      )
    }
    updates.type = body.type
  }

  if (body.text !== undefined) {
    if (typeof body.text !== 'string' || body.text.trim() === '') {
      return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 })
    }
    updates.text = body.text.trim()
  }

  if (body.order !== undefined) {
    updates.order_index = body.order
  }

  if (body.required !== undefined) {
    updates.required = body.required
  }

  const effectiveType = (body.type ?? question.type) as QuestionType
  if (body.options !== undefined) {
    if (effectiveType !== 'multiple_choice') {
      return NextResponse.json(
        { error: 'options can only be set on multiple_choice questions' },
        { status: 400 }
      )
    }
    if (!Array.isArray(body.options) || body.options.length < 2) {
      return NextResponse.json(
        { error: 'multiple_choice questions require at least 2 options' },
        { status: 400 }
      )
    }
    updates.options = body.options
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('questions')
    .update(updates)
    .eq('id', questionId)
    .select('id, survey_id, type, text, options, order_index, required, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: questionId } = await params

  const supabase = await createClient()

  // Fetch the question to verify it exists and get its survey
  const { data: question, error: fetchError } = await supabase
    .from('questions')
    .select('id, survey_id')
    .eq('id', questionId)
    .single()

  if (fetchError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  // Verify the survey is not active/closed
  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .select('id, status')
    .eq('id', question.survey_id)
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

  const { error: deleteError } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
