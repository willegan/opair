import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildDepartmentTree } from '@/lib/departments'
import type { Department } from '@/lib/types/department'

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('departments')
    .select('id, name, parent_id, created_at')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const departments = (data ?? []) as Department[]
  const tree = buildDepartmentTree(departments)

  return NextResponse.json(tree)
}
