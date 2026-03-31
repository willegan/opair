import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'
import type { Survey } from '@/lib/types/survey'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('surveys')
    .select('id, title, status, open_date, close_date, created_at, updated_at, questions(id, type, text, options, order_index, required, created_at)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await params

  let body: Partial<Pick<Survey, 'title' | 'open_date' | 'close_date'>>
  try {
    body = (await request.json()) as Partial<Pick<Survey, 'title' | 'open_date' | 'close_date'>>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Partial<Pick<Survey, 'title' | 'open_date' | 'close_date'>> = {}

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
    }
    updates.title = body.title.trim()
  }
  if (body.open_date !== undefined) updates.open_date = body.open_date
  if (body.close_date !== undefined) updates.close_date = body.close_date

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('surveys')
    .update(updates)
    .eq('id', id)
    .select('id, title, status, open_date, close_date, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  const { id } = await params
  const supabase = await createClient()

  // Check current status
  const { data: survey, error: fetchError } = await supabase
    .from('surveys')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (survey.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft surveys can be deleted' },
      { status: 409 }
    )
  }

  const { error: deleteError } = await supabase
    .from('surveys')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
