export type SurveyStatus = 'draft' | 'active' | 'closed'
export type QuestionType = 'likert' | 'free_text' | 'multiple_choice'

export interface Survey {
  id: string
  title: string
  status: SurveyStatus
  open_date: string | null
  close_date: string | null
  created_at: string
  updated_at: string
}

export interface SurveyWithCount extends Survey {
  question_count: number
}

export interface Question {
  id: string
  survey_id: string
  type: QuestionType
  text: string
  options: string[] | null
  order_index: number
  required: boolean
  created_at: string
}

export interface SurveyWithQuestions extends Survey {
  questions: Question[]
}

export interface ParticipationToken {
  id: string
  staff_id: string
  survey_id: string
  token: string
  created_at: string
  used_at: string | null
}

export interface ValidateSurveyResponse {
  survey_id: string
  title: string
  questions: Pick<Question, 'id' | 'type' | 'text' | 'options' | 'order_index' | 'required'>[]
}
