import { requireAdmin } from '@/lib/supabase/auth'

export default async function AdminSurveysPage() {
  await requireAdmin()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Surveys</h1>
      <p className="mt-4 text-gray-600">Survey management placeholder</p>
    </div>
  )
}
