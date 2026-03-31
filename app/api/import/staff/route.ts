import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin, unauthorizedResponse } from '@/lib/supabase/auth'

interface CsvRow {
  name: string
  email: string
  department: string
}

interface RowError {
  row: number
  message: string
}

interface StaffPreview {
  name: string
  email: string
  department: string
  action: 'create' | 'update'
}

interface DryRunResult {
  would_create: StaffPreview[]
  would_update: StaffPreview[]
  errors: RowError[]
}

interface CommitResult {
  created: number
  updated: number
  errors: RowError[]
}

/**
 * Parse a CSV string into rows. Handles quoted fields and trailing commas.
 * Returns header row separately.
 */
function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.filter((l) => l.trim() !== '')

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  const headers = parseLine(nonEmpty[0]).map((h) => h.toLowerCase().trim())
  const rows = nonEmpty.slice(1).map((l) => parseLine(l))
  return { headers, rows }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Find or create a department by path like "Engineering > Frontend".
 * Returns department id or throws.
 */
async function findOrCreateDepartmentByPath(
  supabase: ReturnType<typeof createAdminClient>,
  path: string
): Promise<string> {
  const parts = path.split('>').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('Empty department path')

  let parentId: string | null = null

  for (const part of parts) {
    // Try to find existing
    const query = supabase
      .from('departments')
      .select('id')
      .eq('name', part)

    const finalQuery = parentId === null
      ? query.is('parent_id', null)
      : query.eq('parent_id', parentId)

    const { data: existing, error } = await finalQuery.maybeSingle()
    if (error) throw new Error(`DB error looking up department '${part}': ${error.message}`)

    if (existing) {
      parentId = existing.id as string
    } else {
      // Create it
      const { data: created, error: createError } = await supabase
        .from('departments')
        .insert({ name: part, parent_id: parentId })
        .select('id')
        .single()
      if (createError) throw new Error(`Failed to create department '${part}': ${createError.message}`)
      parentId = created.id as string
    }
  }

  return parentId!
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return unauthorizedResponse()
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  const dryRunField = formData.get('dry_run')
  const isDryRun = dryRunField === 'true'

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 })
  }

  const rawText = await (file as File).text()
  const { headers, rows } = parseCsv(rawText)

  // Validate headers
  const nameIdx = headers.indexOf('name')
  const emailIdx = headers.indexOf('email')
  const deptIdx = headers.indexOf('department')

  if (nameIdx === -1 || emailIdx === -1 || deptIdx === -1) {
    return NextResponse.json(
      { error: 'CSV must have columns: name, email, department' },
      { status: 400 }
    )
  }

  // Parse rows
  const parsedRows: (CsvRow & { rowNum: number })[] = []
  const rowErrors: RowError[] = []
  const seenEmails = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2 // 1-based, skip header
    const row = rows[i]
    const name = row[nameIdx]?.trim() ?? ''
    const email = row[emailIdx]?.trim().toLowerCase() ?? ''
    const department = row[deptIdx]?.trim() ?? ''

    if (!name) {
      rowErrors.push({ row: rowNum, message: 'name is required' })
      continue
    }
    if (!email) {
      rowErrors.push({ row: rowNum, message: 'email is required' })
      continue
    }
    if (!isValidEmail(email)) {
      rowErrors.push({ row: rowNum, message: `invalid email: ${email}` })
      continue
    }
    if (!department) {
      rowErrors.push({ row: rowNum, message: 'department is required' })
      continue
    }
    if (seenEmails.has(email)) {
      rowErrors.push({ row: rowNum, message: `duplicate email in CSV: ${email}` })
      continue
    }
    seenEmails.add(email)
    parsedRows.push({ name, email, department, rowNum })
  }

  const supabase = createAdminClient()

  // Look up existing staff by email
  const emails = parsedRows.map((r) => r.email)
  const { data: existingStaff, error: lookupError } = await supabase
    .from('staff')
    .select('id, email')
    .in('email', emails.length > 0 ? emails : ['__none__'])

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }

  const existingEmailSet = new Set((existingStaff ?? []).map((s: { email: string }) => s.email))

  if (isDryRun) {
    const wouldCreate: StaffPreview[] = []
    const wouldUpdate: StaffPreview[] = []

    for (const row of parsedRows) {
      const preview: StaffPreview = {
        name: row.name,
        email: row.email,
        department: row.department,
        action: existingEmailSet.has(row.email) ? 'update' : 'create',
      }
      if (preview.action === 'create') wouldCreate.push(preview)
      else wouldUpdate.push(preview)
    }

    return NextResponse.json({
      would_create: wouldCreate,
      would_update: wouldUpdate,
      errors: rowErrors,
    } satisfies DryRunResult)
  }

  // Commit mode: process each row
  let created = 0
  let updated = 0
  const commitErrors: RowError[] = [...rowErrors]

  for (const row of parsedRows) {
    let departmentId: string
    try {
      departmentId = await findOrCreateDepartmentByPath(supabase, row.department)
    } catch (err) {
      commitErrors.push({
        row: row.rowNum,
        message: err instanceof Error ? err.message : 'Failed to resolve department',
      })
      continue
    }

    if (existingEmailSet.has(row.email)) {
      // Update
      const { error: updateError } = await supabase
        .from('staff')
        .update({ name: row.name, department_id: departmentId })
        .eq('email', row.email)

      if (updateError) {
        commitErrors.push({ row: row.rowNum, message: updateError.message })
      } else {
        updated++
      }
    } else {
      // Insert
      const { error: insertError } = await supabase
        .from('staff')
        .insert({ name: row.name, email: row.email, department_id: departmentId })

      if (insertError) {
        commitErrors.push({ row: row.rowNum, message: insertError.message })
      } else {
        created++
      }
    }
  }

  return NextResponse.json({ created, updated, errors: commitErrors } satisfies CommitResult)
}
