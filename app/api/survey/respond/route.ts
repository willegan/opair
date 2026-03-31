import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface AnswerInput {
  question_id: string
  answer: string
}

interface RespondPayload {
  token: string
  answers: AnswerInput[]
}

export async function POST(request: NextRequest) {
  let body: Partial<RespondPayload>
  try {
    body = (await request.json()) as Partial<RespondPayload>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { token, answers } = body

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: 'answers array is required' }, { status: 400 })
  }

  // Validate each answer entry
  for (const ans of answers) {
    if (!ans.question_id || typeof ans.question_id !== 'string') {
      return NextResponse.json({ error: 'Each answer must have a question_id' }, { status: 400 })
    }
    if (ans.answer === undefined || ans.answer === null || ans.answer === '') {
      return NextResponse.json(
        { error: `Answer for question ${ans.question_id} is required` },
        { status: 400 }
      )
    }
  }

  const supabase = createAdminClient()

  // Fetch token with staff (for department_id) and survey
  const { data: tokenData, error: tokenError } = await supabase
    .from('participation_tokens')
    .select('id, used_at, staff_id, survey_id, staff(department_id), surveys(id, title, status, open_date, close_date)')
    .eq('token', token)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // 410 if already used
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
  const staffRecord = tokenData.staff as { department_id: string }

  // Check survey is active and within date window
  if (survey.status !== 'active') {
    return NextResponse.json({ error: 'Survey is not active' }, { status: 403 })
  }

  const now = new Date().toISOString()
  if (survey.open_date && now < survey.open_date) {
    return NextResponse.json({ error: 'Survey not yet open' }, { status: 403 })
  }
  if (survey.close_date && now > survey.close_date) {
    return NextResponse.json({ error: 'Survey has closed' }, { status: 403 })
  }

  // Verify all answered questions belong to this survey and all questions are answered
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id, required')
    .eq('survey_id', survey.id)

  if (questionsError) {
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }

  const questionIds = new Set((questions ?? []).map((q: { id: string }) => q.id))
  const answeredIds = new Set(answers.map((a) => a.question_id))

  // All submitted question_ids must belong to this survey
  for (const ans of answers) {
    if (!questionIds.has(ans.question_id)) {
      return NextResponse.json(
        { error: `Question ${ans.question_id} does not belong to this survey` },
        { status: 400 }
      )
    }
  }

  // All required questions must be answered
  const requiredQuestions = (questions ?? []).filter((q: { id: string; required: boolean }) => q.required)
  for (const q of requiredQuestions) {
    if (!answeredIds.has(q.id)) {
      return NextResponse.json(
        { error: `Required question ${q.id} was not answered` },
        { status: 400 }
      )
    }
  }

  const departmentId = staffRecord.department_id

  // Insert responses — NO staff_id (anonymity enforced at schema level)
  const responseRows = answers.map((ans) => ({
    survey_id: survey.id,
    question_id: ans.question_id,
    answer: String(ans.answer),
    department_id: departmentId,
  }))

  const { error: insertError } = await supabase
    .from('responses')
    .insert(responseRows)

  if (insertError) {
    return NextResponse.json({ error: 'Failed to save responses' }, { status: 500 })
  }

  // Stamp used_at on SUBMISSION (not validation) — allows network retries before submit
  const { error: stampError } = await supabase
    .from('participation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenData.id)

  if (stampError) {
    // Responses already inserted — log but don't fail (idempotency handled by used_at check)
    console.error('Failed to stamp token used_at:', stampError.message)
  }

  return NextResponse.json({ success: true })
}
