import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await params
  const supabase = await createClient()

  // Fetch the original survey + its questions
  const { data: original, error: fetchError } = await supabase
    .from('surveys')
    .select('id, title, questions(type, text, options, order_index, required)')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Create the duplicate survey as a draft
  const { data: newSurvey, error: insertError } = await supabase
    .from('surveys')
    .insert({
      title: `Copy of ${original.title}`,
      status: 'draft',
      open_date: null,
      close_date: null,
    })
    .select('id, title, status, open_date, close_date, created_at, updated_at')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Copy all questions to the new survey
  interface OriginalQuestion {
    type: string
    text: string
    options: unknown
    order_index: number
    required: boolean
  }

  const questions = (original.questions as OriginalQuestion[]) ?? []
  if (questions.length > 0) {
    const questionRows = questions.map((q: OriginalQuestion) => ({
      survey_id: newSurvey.id,
      type: q.type,
      text: q.text,
      options: q.options,
      order_index: q.order_index,
      required: q.required,
    }))

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionRows)

    if (questionsError) {
      // Roll back the survey if questions fail
      await supabase.from('surveys').delete().eq('id', newSurvey.id)
      return NextResponse.json({ error: questionsError.message }, { status: 500 })
    }
  }

  return NextResponse.json(newSurvey, { status: 201 })
}
