import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDescendantIds } from '@/lib/departments'
import type { Department } from '@/lib/types/department'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch all departments (needed for recursive tree walk)
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, parent_id, created_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const departments = (data ?? []) as Department[]

  // Verify the requested department exists
  const root = departments.find((d) => d.id === id)
  if (!root) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  const descendantIds = getDescendantIds(departments, id)

  return NextResponse.json({ ids: descendantIds })
}
