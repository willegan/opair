import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ReorderBody {
  questionIds: string[]
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: surveyId } = await params

  let body: Partial<ReorderBody>
  try {
    body = (await request.json()) as Partial<ReorderBody>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { questionIds } = body

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json({ error: 'questionIds must be a non-empty array' }, { status: 400 })
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

  // Update order_index for each question ID (index = order position)
  const updates = questionIds.map((questionId, index) =>
    supabase
      .from('questions')
      .update({ order_index: index })
      .eq('id', questionId)
      .eq('survey_id', surveyId)
  )

  const results = await Promise.all(updates)
  for (const { error } of results) {
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ reordered: questionIds.length })
}
