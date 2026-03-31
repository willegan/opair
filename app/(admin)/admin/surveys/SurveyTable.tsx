'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SurveyWithCount } from '@/lib/types/survey'

type StatusFilter = 'all' | 'draft' | 'active' | 'closed'
type SortKey = 'created_at' | 'title' | 'response_count'

interface Props {
  initialSurveys: SurveyWithCount[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

export default function SurveyTable({ initialSurveys }: Props) {
  const router = useRouter()
  const [surveys, setSurveys] = useState<SurveyWithCount[]>(initialSurveys)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDesc, setSortDesc] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = surveys
    .filter((s) => statusFilter === 'all' || s.status === statusFilter)
    .sort((a, b) => {
      let diff = 0
      if (sortKey === 'title') {
        diff = a.title.localeCompare(b.title)
      } else if (sortKey === 'response_count') {
        diff = (a.question_count ?? 0) - (b.question_count ?? 0)
      } else {
        diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return sortDesc ? -diff : diff
    })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  async function handleDuplicate(id: string, title: string) {
    const res = await fetch(`/api/surveys/${id}/duplicate`, { method: 'POST' })
    if (!res.ok) {
      alert('Failed to duplicate survey')
      return
    }
    const copy = (await res.json()) as SurveyWithCount
    setSurveys((prev) => [copy, ...prev])
  }

  async function handleActivate(id: string) {
    const res = await fetch(`/api/surveys/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      alert(body.error ?? 'Failed to activate survey')
      return
    }
    setSurveys((prev) => prev.map((s) => s.id === id ? { ...s, status: 'active' } : s))
  }

  async function handleClose(id: string) {
    const res = await fetch(`/api/surveys/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      alert(body.error ?? 'Failed to close survey')
      return
    }
    setSurveys((prev) => prev.map((s) => s.id === id ? { ...s, status: 'closed' } : s))
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/surveys/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      alert(body.error ?? 'Failed to delete survey')
      return
    }
    setSurveys((prev) => prev.filter((s) => s.id !== id))
    setConfirmDelete(null)
  }

  const statusCounts: Record<StatusFilter, number> = {
    all: surveys.length,
    draft: surveys.filter((s) => s.status === 'draft').length,
    active: surveys.filter((s) => s.status === 'active').length,
    closed: surveys.filter((s) => s.status === 'closed').length,
  }

  const STATUS_TABS: StatusFilter[] = ['all', 'draft', 'active', 'closed']

  if (surveys.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">No surveys yet</p>
        <p className="text-sm mt-2">Create your first survey to get started.</p>
        <a
          href="/admin/surveys/new"
          className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
        >
          Create Survey
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              statusFilter === tab
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab} ({statusCounts[tab]})
          </button>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex gap-2 mb-3 text-sm text-gray-500">
        <span>Sort by:</span>
        {(['created_at', 'title', 'response_count'] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => toggleSort(k)}
            className={`px-2 py-1 rounded border ${sortKey === k ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'border-gray-200 hover:border-gray-300'}`}
          >
            {k === 'created_at' ? 'Date' : k === 'response_count' ? 'Responses' : 'Title'}
            {sortKey === k ? (sortDesc ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">No {statusFilter} surveys.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Open Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Close Date</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Questions</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((survey) => (
                <tr key={survey.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{survey.title}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[survey.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {survey.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(survey.open_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(survey.close_date)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{survey.question_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {survey.status === 'draft' && (
                        <a
                          href={`/admin/surveys/${survey.id}/edit`}
                          className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                        >
                          Edit
                        </a>
                      )}
                      <button
                        onClick={() => startTransition(() => { void handleDuplicate(survey.id, survey.title) })}
                        className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        Duplicate
                      </button>
                      {survey.status === 'draft' && (
                        <button
                          onClick={() => startTransition(() => { void handleActivate(survey.id) })}
                          className="px-2 py-1 text-xs rounded border border-green-300 text-green-700 hover:bg-green-50"
                        >
                          Activate
                        </button>
                      )}
                      {survey.status === 'active' && (
                        <button
                          onClick={() => startTransition(() => { void handleClose(survey.id) })}
                          className="px-2 py-1 text-xs rounded border border-orange-300 text-orange-700 hover:bg-orange-50"
                        >
                          Close
                        </button>
                      )}
                      {(survey.status === 'active' || survey.status === 'closed') && (
                        <a
                          href={`/admin/surveys/${survey.id}/results`}
                          className="px-2 py-1 text-xs rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                        >
                          Results
                        </a>
                      )}
                      {survey.status === 'draft' && (
                        <button
                          onClick={() => setConfirmDelete(survey.id)}
                          className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete survey?</h2>
            <p className="text-gray-600 text-sm mb-4">
              This action cannot be undone. The survey and all its questions will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                onClick={() => startTransition(() => { void handleDelete(confirmDelete) })}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
