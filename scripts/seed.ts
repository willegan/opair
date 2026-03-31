#!/usr/bin/env ts-node
/**
 * scripts/seed.ts
 *
 * Generates realistic seed data for the Ausmed Engagement Survey platform.
 * Run: npx ts-node scripts/seed.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Department structure
// ---------------------------------------------------------------------------

interface DeptSpec {
  name: string
  children?: DeptSpec[]
}

const DEPT_TREE: DeptSpec[] = [
  {
    name: 'Ausmed',
    children: [
      {
        name: 'Engineering',
        children: [
          { name: 'Frontend' },
          { name: 'Backend' },
          { name: 'DevOps' },
        ],
      },
      {
        name: 'Product',
        children: [
          { name: 'Design' },
          { name: 'Product Management' },
        ],
      },
      {
        name: 'People & Culture',
        children: [
          { name: 'HR' },
          { name: 'Recruiting' },
        ],
      },
      {
        name: 'Operations',
        children: [
          { name: 'Finance' },
          { name: 'Marketing' },
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalDist(mean: number, std: number, min: number, max: number): number {
  // Box-Muller transform
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.max(min, Math.min(max, Math.round(mean + std * z)))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function resetData() {
  console.log('Resetting seed data…')

  // Delete in dependency order
  await supabase.from('responses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('participation_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('surveys').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('staff').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('departments').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  console.log('  ✓ Cleared existing seed data (auth.users preserved)')
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

async function createDepartments(): Promise<{ leafIds: string[]; allIds: string[] }> {
  console.log('Creating departments…')

  const leafIds: string[] = []
  const allIds: string[] = []

  async function insertTree(specs: DeptSpec[], parentId: string | null) {
    for (const spec of specs) {
      const { data, error } = await supabase
        .from('departments')
        .insert({ name: spec.name, parent_id: parentId })
        .select('id')
        .single()

      if (error) throw new Error(`Failed to create dept '${spec.name}': ${error.message}`)

      const id = data.id as string
      allIds.push(id)

      if (spec.children && spec.children.length > 0) {
        await insertTree(spec.children, id)
      } else {
        leafIds.push(id) // leaf department
      }
    }
  }

  await insertTree(DEPT_TREE, null)
  console.log(`  ✓ Created ${allIds.length} departments (${leafIds.length} leaf)`)
  return { leafIds, allIds }
}

// ---------------------------------------------------------------------------
// Staff (100 members across leaf departments)
// ---------------------------------------------------------------------------

async function createStaff(leafIds: string[]): Promise<string[]> {
  console.log('Creating 100 staff members…')

  const TOTAL = 100
  const staffRows = []

  for (let i = 0; i < TOTAL; i++) {
    const deptId = leafIds[i % leafIds.length]
    staffRows.push({
      name: faker.person.fullName(),
      email: faker.internet.email({ provider: 'ausmed.com.example' }).toLowerCase(),
      department_id: deptId,
    })
  }

  // Ensure unique emails
  const uniqueEmails = new Set<string>()
  const deduped = staffRows.filter((s) => {
    if (uniqueEmails.has(s.email)) {
      s.email = `${faker.string.alphanumeric(6)}.${s.email}`
    }
    uniqueEmails.add(s.email)
    return true
  })

  const { data, error } = await supabase
    .from('staff')
    .insert(deduped)
    .select('id')

  if (error) throw new Error(`Failed to create staff: ${error.message}`)

  const ids = (data ?? []).map((s: { id: string }) => s.id)
  console.log(`  ✓ Created ${ids.length} staff members`)
  return ids
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const LIKERT_QUESTIONS = [
  'I feel valued as an employee at Ausmed.',
  'My manager supports my professional development.',
  'I have the resources I need to do my job effectively.',
  'I feel comfortable raising concerns with my team.',
  'I understand how my work contributes to Ausmed\'s mission.',
  'I am proud to work at Ausmed.',
  'I would recommend Ausmed as a great place to work.',
]

const FREE_TEXT_QUESTIONS = [
  'What is one thing Ausmed could do to better support your wellbeing?',
  'What is one thing you appreciate most about working at Ausmed?',
]

const MC_QUESTION = {
  text: 'How long have you worked at Ausmed?',
  options: ['Less than 1 year', '1–2 years', '3–5 years', 'More than 5 years'],
}

async function createQuestions(surveyId: string): Promise<string[]> {
  const rows = [
    ...LIKERT_QUESTIONS.map((text, i) => ({
      survey_id: surveyId,
      type: 'likert' as const,
      text,
      order_index: i + 1,
      required: true,
      options: null,
    })),
    ...FREE_TEXT_QUESTIONS.map((text, i) => ({
      survey_id: surveyId,
      type: 'free_text' as const,
      text,
      order_index: LIKERT_QUESTIONS.length + i + 1,
      required: false,
      options: null,
    })),
    {
      survey_id: surveyId,
      type: 'multiple_choice' as const,
      text: MC_QUESTION.text,
      order_index: LIKERT_QUESTIONS.length + FREE_TEXT_QUESTIONS.length + 1,
      required: true,
      options: MC_QUESTION.options,
    },
  ]

  const { data, error } = await supabase
    .from('questions')
    .insert(rows)
    .select('id, type')

  if (error) throw new Error(`Failed to create questions: ${error.message}`)
  return (data ?? []).map((q: { id: string }) => q.id)
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

interface SurveySpec {
  title: string
  status: 'draft' | 'active' | 'closed'
  open_date: string
  close_date: string
  responseRate: number
}

const SURVEYS: SurveySpec[] = [
  {
    title: 'Q3 2024 Engagement Survey',
    status: 'closed',
    open_date: '2024-07-01',
    close_date: '2024-07-31',
    responseRate: 0.85,
  },
  {
    title: 'Q1 2025 Engagement Survey',
    status: 'active',
    open_date: '2025-01-15',
    close_date: '2025-02-15',
    responseRate: 0.60,
  },
]

// ---------------------------------------------------------------------------
// Tokens + Responses
// ---------------------------------------------------------------------------

async function createTokensAndResponses(
  surveyId: string,
  staffIds: string[],
  questionIds: string[],
  spec: SurveySpec,
  deptByStaffId: Map<string, string>
) {
  const respondingCount = Math.round(staffIds.length * spec.responseRate)
  const respondingIds = shuffle(staffIds).slice(0, respondingCount)
  const nonRespondingIds = staffIds.filter((id) => !respondingIds.includes(id))

  // Insert all tokens
  const allTokens = [
    ...respondingIds.map((staffId) => ({
      staff_id: staffId,
      survey_id: surveyId,
      token: faker.string.uuid(),
      used_at: faker.date.between({
        from: spec.open_date,
        to: spec.close_date,
      }).toISOString(),
    })),
    ...nonRespondingIds.map((staffId) => ({
      staff_id: staffId,
      survey_id: surveyId,
      token: faker.string.uuid(),
      used_at: null,
    })),
  ]

  const { error: tokenError } = await supabase
    .from('participation_tokens')
    .insert(allTokens)

  if (tokenError) throw new Error(`Failed to insert tokens: ${tokenError.message}`)

  // Insert responses for responders — NO staff_id
  const FREE_TEXT_RESPONSES = [
    'More regular team check-ins would be helpful.',
    'Better tooling for remote collaboration.',
    'Career progression clarity and clearer feedback cycles.',
    'More flexible working hours.',
    'Invest in learning and development budget.',
    'The team culture and collaborative spirit.',
    'The mission — helping healthcare professionals learn.',
    'Supportive management and clear communication.',
    'Flexible work-from-home policy.',
    'Opportunities to work on meaningful projects.',
  ]

  const MC_OPTIONS = MC_QUESTION.options
  const responseRows = []

  for (const staffId of respondingIds) {
    const deptId = deptByStaffId.get(staffId)!

    for (const questionId of questionIds) {
      // Find question type — we'll derive from order in our list
      const qIdx = questionIds.indexOf(questionId)
      let answer: string

      if (qIdx < LIKERT_QUESTIONS.length) {
        // Likert: normal distribution mean 3.7, std 0.9
        answer = String(normalDist(3.7, 0.9, 1, 5))
      } else if (qIdx < LIKERT_QUESTIONS.length + FREE_TEXT_QUESTIONS.length) {
        // Free text
        answer = FREE_TEXT_RESPONSES[Math.floor(Math.random() * FREE_TEXT_RESPONSES.length)]
      } else {
        // Multiple choice
        answer = MC_OPTIONS[Math.floor(Math.random() * MC_OPTIONS.length)]
      }

      responseRows.push({
        survey_id: surveyId,
        question_id: questionId,
        answer,
        department_id: deptId,
      })
    }
  }

  // Insert in batches of 500
  for (let i = 0; i < responseRows.length; i += 500) {
    const batch = responseRows.slice(i, i + 500)
    const { error } = await supabase.from('responses').insert(batch)
    if (error) throw new Error(`Failed to insert responses batch: ${error.message}`)
  }

  console.log(
    `  ✓ Survey "${spec.title}": ${respondingCount}/${staffIds.length} responses (${Math.round(spec.responseRate * 100)}%)`
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🌱 Ausmed Engagement Survey — Seed Generator\n')

  await resetData()

  const { leafIds } = await createDepartments()
  const staffIds = await createStaff(leafIds)

  // Build staff→department map
  const { data: staffData, error: staffLookupErr } = await supabase
    .from('staff')
    .select('id, department_id')

  if (staffLookupErr) throw new Error(`Failed to fetch staff: ${staffLookupErr.message}`)
  const deptByStaffId = new Map<string, string>()
  for (const s of (staffData ?? []) as { id: string; department_id: string }[]) {
    deptByStaffId.set(s.id, s.department_id)
  }

  console.log('Creating surveys…')
  for (const spec of SURVEYS) {
    const { data: survey, error: surveyErr } = await supabase
      .from('surveys')
      .insert({
        title: spec.title,
        status: spec.status,
        open_date: spec.open_date,
        close_date: spec.close_date,
      })
      .select('id')
      .single()

    if (surveyErr) throw new Error(`Failed to create survey '${spec.title}': ${surveyErr.message}`)

    const questionIds = await createQuestions(survey.id as string)
    await createTokensAndResponses(survey.id as string, staffIds, questionIds, spec, deptByStaffId)
  }

  console.log('\n✅ Seed complete!\n')
}

main().catch((err: unknown) => {
  console.error('\n❌ Seed failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
