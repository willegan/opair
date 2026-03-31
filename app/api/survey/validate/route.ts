import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ValidateSurveyResponse } from '@/lib/types/survey'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // Query participation_tokens by token
  const { data: tokenData, error: tokenError } = await supabase
    .from('participation_tokens')
    .select('*, surveys(*)')
    .eq('token', token)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // 410 if used_at != null
  if (tokenData.used_at !== null) {
    return NextResponse.json({ error: 'Token already used' }, { status: 410 })
  }

  const survey = tokenData.surveys

  // 403 if survey status != 'open'
  if (survey.status !== 'open') {
    return NextResponse.json({ error: 'Survey not open' }, { status: 403 })
  }

  // Check date range
  const now = new Date().toISOString()
  if (survey.start_date && now < survey.start_date) {
    return NextResponse.json({ error: 'Survey not yet started' }, { status: 403 })
  }
  if (survey.end_date && now > survey.end_date) {
    return NextResponse.json({ error: 'Survey has ended' }, { status: 403 })
  }

  // Fetch questions ordered by order_index
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id, type, text, options, order_index, required')
    .eq('survey_id', survey.id)
    .order('order_index', { ascending: true })

  if (questionsError) {
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }

  const response: ValidateSurveyResponse = {
    survey_id: survey.id,
    title: survey.title,
    description: survey.description,
    questions: questions || []
  }

  return NextResponse.json(response)
}
