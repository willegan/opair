import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import type { SurveyStatus } from '@/lib/types/survey'

interface RouteParams {
  params: Promise<{ id: string }>
}

const VALID_TRANSITIONS: Record<SurveyStatus, SurveyStatus[]> = {
  draft: ['active'],
  active: ['closed'],
  closed: [],
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await params

  let body: { status?: unknown }
  try {
    body = (await request.json()) as { status?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const newStatus = body.status as SurveyStatus | undefined
  if (!newStatus || !['draft', 'active', 'closed'].includes(newStatus)) {
    return NextResponse.json(
      { error: 'status must be one of: draft, active, closed' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // Fetch current survey
  const { data: survey, error: fetchError } = await supabase
    .from('surveys')
    .select('id, title, status, open_date, close_date')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const currentStatus = survey.status as SurveyStatus

  // Check transition is valid
  if (!VALID_TRANSITIONS[currentStatus].includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${currentStatus}' to '${newStatus}'` },
      { status: 400 }
    )
  }

  // Extra validation for draft → active
  if (currentStatus === 'draft' && newStatus === 'active') {
    const errors: string[] = []

    if (!survey.title || survey.title.trim() === '') {
      errors.push('Survey must have a title')
    }
    if (!survey.open_date) {
      errors.push('Survey must have an open_date')
    }
    if (!survey.close_date) {
      errors.push('Survey must have a close_date')
    }

    // Check question count
    const { count, error: countError } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('survey_id', id)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    if (!count || count === 0) {
      errors.push('Survey must have at least one question')
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }
  }

  const { data, error: updateError } = await supabase
    .from('surveys')
    .update({ status: newStatus })
    .eq('id', id)
    .select('id, title, status, open_date, close_date, created_at, updated_at')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
