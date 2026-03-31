export type QuestionType = 'likert' | 'free_text' | 'multiple_choice'
export interface Survey { id: string; title: string; description: string | null; status: 'draft' | 'open' | 'closed'; start_date: string | null; end_date: string | null; created_at: string; updated_at: string }
export interface Question { id: string; survey_id: string; type: QuestionType; text: string; options: string[] | null; order_index: number; required: boolean; created_at: string }
export interface ParticipationToken { id: string; staff_id: string; survey_id: string; token: string; created_at: string; used_at: string | null }
export interface ValidateSurveyResponse { survey_id: string; title: string; description: string | null; questions: Pick<Question, 'id' | 'type' | 'text' | 'options' | 'order_index' | 'required'>[] }
