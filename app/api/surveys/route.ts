import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import type { Survey } from '@/lib/types/survey'

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('surveys')
    .select('id, title, status, open_date, close_date, created_at, updated_at, questions(count)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const surveys = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    open_date: row.open_date,
    close_date: row.close_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    question_count: Array.isArray(row.questions)
      ? (row.questions[0] as { count: number } | undefined)?.count ?? 0
      : 0,
  }))

  return NextResponse.json(surveys)
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  let body: Partial<Pick<Survey, 'title' | 'open_date' | 'close_date'>>
  try {
    body = (await request.json()) as Partial<Pick<Survey, 'title' | 'open_date' | 'close_date'>>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { title, open_date, close_date } = body

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('surveys')
    .insert({
      title: title.trim(),
      status: 'draft',
      open_date: open_date ?? null,
      close_date: close_date ?? null,
    })
    .select('id, title, status, open_date, close_date, created_at, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
