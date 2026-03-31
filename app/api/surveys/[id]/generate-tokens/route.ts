import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check admin auth
  const supabaseClient = await createClient()
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Await params (Next.js 15)
  const { id: surveyId } = await params

  const supabaseAdmin = await createAdminClient()

  // Fetch all staff
  const { data: staff, error: staffError } = await supabaseAdmin
    .from('staff')
    .select('id')

  if (staffError) {
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
  }

  if (!staff || staff.length === 0) {
    return NextResponse.json({ generated: 0 })
  }

  // Generate tokens for each staff member
  const tokens = staff.map((s) => ({
    staff_id: s.id,
    survey_id: surveyId,
    token: randomBytes(32).toString('hex')
  }))

  // Upsert with onConflict: 'staff_id,survey_id'
  const { error: upsertError } = await supabaseAdmin
    .from('participation_tokens')
    .upsert(tokens, {
      onConflict: 'staff_id,survey_id'
    })

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to generate tokens' }, { status: 500 })
  }

  return NextResponse.json({ generated: tokens.length })
}
