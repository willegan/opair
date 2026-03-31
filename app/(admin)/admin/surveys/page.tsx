import { requireAdmin } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import SurveyTable from './SurveyTable'
import type { SurveyWithCount } from '@/lib/types/survey'

export const dynamic = 'force-dynamic'

export default async function AdminSurveysPage() {
  await requireAdmin()

  const supabase = await createClient()

  // Fetch all surveys with question counts
  const { data, error } = await supabase
    .from('surveys')
    .select('id, title, status, open_date, close_date, created_at, updated_at, questions(count)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600">Failed to load surveys: {error.message}</p>
      </div>
    )
  }

  const surveys: SurveyWithCount[] = (data ?? []).map((row) => ({
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
        <a
          href="/admin/surveys/new"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
        >
          + New Survey
        </a>
      </div>
      <SurveyTable initialSurveys={surveys} />
    </div>
  )
}
