-- Anonymity enforced: responses.staff_id does not exist. Department context derived from participation_token server-side.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- departments
-- ============================================================
CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES departments(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_departments_parent_id ON departments(parent_id);

-- ============================================================
-- staff
-- ============================================================
CREATE TABLE staff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  email          text UNIQUE NOT NULL,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_department_id ON staff(department_id);
CREATE INDEX idx_staff_email ON staff(email);

-- ============================================================
-- surveys
-- ============================================================
CREATE TABLE surveys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'closed')),
  open_date   date,
  close_date  date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_surveys_status ON surveys(status);

-- ============================================================
-- questions
-- ============================================================
CREATE TABLE questions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  type         text NOT NULL
                 CHECK (type IN ('likert', 'free_text', 'multiple_choice')),
  text         text NOT NULL,
  order_index  int NOT NULL,
  options      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_survey_id ON questions(survey_id);
CREATE INDEX idx_questions_survey_order ON questions(survey_id, order_index);

-- ============================================================
-- responses  — NO staff_id column: anonymity enforced at schema level
-- ============================================================
CREATE TABLE responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id      uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id    uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer         text NOT NULL,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_responses_survey_id      ON responses(survey_id);
CREATE INDEX idx_responses_question_id    ON responses(question_id);
CREATE INDEX idx_responses_department_id  ON responses(department_id);

-- ============================================================
-- participation_tokens
-- ============================================================
CREATE TABLE participation_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  survey_id   uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, survey_id)
);

CREATE INDEX idx_participation_tokens_token     ON participation_tokens(token);
CREATE INDEX idx_participation_tokens_staff_id  ON participation_tokens(staff_id);
CREATE INDEX idx_participation_tokens_survey_id ON participation_tokens(survey_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE participation_tokens ENABLE ROW LEVEL SECURITY;

-- Deny all anon/authenticated access by default; server-side service role bypasses RLS.
-- Responses: explicitly no policy allows reading by staff_id (column doesn't exist).
-- Admin operations use service_role key which bypasses RLS.

-- Allow service_role full access (implicit — service_role bypasses RLS)
-- Block direct table access to responses for non-service roles
CREATE POLICY "no_direct_response_access" ON responses
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);

-- Participation tokens: staff can only read their own token via server-side lookup
CREATE POLICY "service_role_only_participation_tokens" ON participation_tokens
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);

-- Staff table: no direct client access
CREATE POLICY "service_role_only_staff" ON staff
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false);

-- Departments: readable by authenticated users (no sensitive data)
CREATE POLICY "authenticated_read_departments" ON departments
  FOR SELECT
  TO authenticated
  USING (true);

-- Surveys: readable by authenticated users
CREATE POLICY "authenticated_read_surveys" ON surveys
  FOR SELECT
  TO authenticated
  USING (true);

-- Questions: readable by authenticated users
CREATE POLICY "authenticated_read_questions" ON questions
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Updated_at trigger for surveys
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER surveys_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
