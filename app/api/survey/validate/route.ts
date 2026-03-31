import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { ValidateSurveyResponse } from '@/lib/types/survey'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Query participation_tokens by token value (join survey)
  const { data: tokenData, error: tokenError } = await supabase
    .from('participation_tokens')
    .select('*, surveys(id, title, status, open_date, close_date)')
    .eq('token', token)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // 410 Gone if already used
  if (tokenData.used_at !== null) {
    return NextResponse.json({ error: 'Token already used' }, { status: 410 })
  }

  const survey = tokenData.surveys as {
    id: string
    title: string
    status: string
    open_date: string | null
    close_date: string | null
  }

  // 403 if survey not active
  if (survey.status !== 'active') {
    return NextResponse.json({ error: 'Survey is not active' }, { status: 403 })
  }

  // Check date window
  const now = new Date().toISOString()
  if (survey.open_date && now < survey.open_date) {
    return NextResponse.json({ error: 'Survey not yet open' }, { status: 403 })
  }
  if (survey.close_date && now > survey.close_date) {
    return NextResponse.json({ error: 'Survey has closed' }, { status: 403 })
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
    questions: questions ?? [],
  }

  return NextResponse.json(response)
}
