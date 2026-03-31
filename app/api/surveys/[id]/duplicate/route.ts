import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id: surveyId } = await params

  const supabase = await createClient()

  // Fetch original survey
  const { data: original, error: origError } = await supabase
    .from('surveys')
    .select('title, open_date, close_date')
    .eq('id', surveyId)
    .single()

  if (origError || !original) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }

  // Create copy with draft status
  const { data: copy, error: copyError } = await supabase
    .from('surveys')
    .insert({
      title: `Copy of ${original.title}`,
      status: 'draft',
      open_date: original.open_date,
      close_date: original.close_date,
    })
    .select('id, title, status, open_date, close_date, created_at, updated_at')
    .single()

  if (copyError || !copy) {
    return NextResponse.json({ error: copyError?.message ?? 'Failed to create copy' }, { status: 500 })
  }

  // Copy all questions from original to the new survey
  const { data: questions } = await supabase
    .from('questions')
    .select('type, text, options, order_index, required')
    .eq('survey_id', surveyId)
    .order('order_index')

  if (questions && questions.length > 0) {
    const questionRows = questions.map((q) => ({
      survey_id: copy.id,
      type: q.type,
      text: q.text,
      options: q.options,
      order_index: q.order_index,
      required: q.required,
    }))

    const { error: questionsError } = await supabase.from('questions').insert(questionRows)
    if (questionsError) {
      // Clean up the orphaned survey copy
      await supabase.from('surveys').delete().eq('id', copy.id)
      return NextResponse.json({ error: questionsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ...copy, question_count: questions?.length ?? 0 }, { status: 201 })
}
