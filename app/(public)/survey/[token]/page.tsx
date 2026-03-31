'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ValidateSurveyResponse } from '@/lib/types/survey'

interface PageProps {
  params: Promise<{ token: string }>
}

export default function SurveyTokenPage({ params }: PageProps) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [survey, setSurvey] = useState<ValidateSurveyResponse | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t)
      fetch(`/api/survey/validate?token=${encodeURIComponent(t)}`)
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json()) as { error?: string }
            if (res.status === 410) setError('This survey link has already been used.')
            else if (res.status === 404) setError('Survey link not found.')
            else if (res.status === 403) setError(body.error ?? 'This survey is not currently open.')
            else setError(body.error ?? 'Failed to load survey.')
            return
          }
          const data = (await res.json()) as ValidateSurveyResponse
          setSurvey(data)
        })
        .catch(() => setError('Network error. Please try again.'))
    })
  }, [params])

  function handleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!survey || !token) return

    // Check all questions answered
    const unanswered = survey.questions.filter(
      (q) => q.required && (!answers[q.id] || answers[q.id].trim() === '')
    )
    if (unanswered.length > 0) {
      setError('Please answer all required questions before submitting.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/survey/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          answers: Object.entries(answers).map(([question_id, answer]) => ({
            question_id,
            answer,
          })),
        }),
      })

      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setError(body.error ?? 'Submission failed. Please try again.')
        return
      }

      router.push('/survey/complete')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="max-w-md w-full rounded-lg bg-red-50 border border-red-200 p-6 text-center">
          <h1 className="text-xl font-semibold text-red-800 mb-2">Unable to load survey</h1>
          <p className="text-red-700">{error}</p>
        </div>
      </main>
    )
  }

  if (!survey) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="text-gray-500">Loading survey…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{survey.title}</h1>
          <p className="text-gray-500 text-sm">Your responses are anonymous.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {survey.questions.map((question, idx) => (
            <div key={question.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <p className="font-medium text-gray-900 mb-4">
                {idx + 1}. {question.text}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </p>

              {question.type === 'likert' && (
                <div className="flex gap-3 flex-wrap">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <label key={val} className="flex flex-col items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name={question.id}
                        value={String(val)}
                        checked={answers[question.id] === String(val)}
                        onChange={() => handleAnswer(question.id, String(val))}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-600">{val}</span>
                    </label>
                  ))}
                  <div className="flex justify-between w-full text-xs text-gray-400 mt-1 px-1">
                    <span>Strongly Disagree</span>
                    <span>Strongly Agree</span>
                  </div>
                </div>
              )}

              {question.type === 'free_text' && (
                <textarea
                  value={answers[question.id] ?? ''}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your response…"
                />
              )}

              {question.type === 'multiple_choice' && question.options && (
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label key={option} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={answers[question.id] === option}
                        onChange={() => handleAnswer(question.id, option)}
                        className="h-4 w-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-6 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Survey'}
          </button>
        </form>
      </div>
    </main>
  )
}
