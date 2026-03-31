-- ============================================================
-- Migration: RLS policies for anonymity and access control
-- Issue #2: Implement Row-Level Security (RLS) policies
-- ============================================================

-- ============================================================
-- Drop the broad deny-all policies from initial schema
-- These will be replaced by more granular policies below.
-- ============================================================
DROP POLICY IF EXISTS "no_direct_response_access" ON responses;
DROP POLICY IF EXISTS "service_role_only_participation_tokens" ON participation_tokens;
DROP POLICY IF EXISTS "service_role_only_staff" ON staff;
DROP POLICY IF EXISTS "authenticated_read_departments" ON departments;
DROP POLICY IF EXISTS "authenticated_read_surveys" ON surveys;
DROP POLICY IF EXISTS "authenticated_read_questions" ON questions;

-- ============================================================
-- Helper function: validate a participation token for INSERT
-- Returns true if the token exists, has not been used,
-- and the survey is currently active.
-- This function runs as the INVOKER (no privilege escalation).
-- ============================================================
CREATE OR REPLACE FUNCTION is_valid_unused_token(p_token text, p_survey_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participation_tokens pt
    JOIN surveys s ON s.id = pt.survey_id
    WHERE pt.token = p_token
      AND pt.survey_id = p_survey_id
      AND pt.used_at IS NULL
      AND s.status = 'active'
      AND (s.open_date IS NULL OR s.open_date <= CURRENT_DATE)
      AND (s.close_date IS NULL OR s.close_date >= CURRENT_DATE)
  );
$$;

-- Grant execute to anon/authenticated so the policy can call it
GRANT EXECUTE ON FUNCTION is_valid_unused_token(text, uuid) TO anon, authenticated;

-- ============================================================
-- RESPONSES table
-- ============================================================

-- No SELECT for anon or authenticated (service_role bypasses RLS)
-- Already blocked by having no SELECT policy (deny-by-default when RLS is on)

-- INSERT: only allowed when a valid, unused token exists for this survey
-- The token is passed in the response row's 'survey_id' context.
-- Actual token matching is handled at the application layer via service_role,
-- but we add a DB-level guard using a session variable set by the API route.
-- The API route sets: SET LOCAL app.submission_token = '<token>';
CREATE POLICY "anon_insert_with_token" ON responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    is_valid_unused_token(
      current_setting('app.submission_token', true),
      survey_id
    )
  );

-- Admin (authenticated) can read all responses
CREATE POLICY "admin_read_all" ON responses
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- PARTICIPATION_TOKENS table
-- ============================================================

-- Anon users can SELECT their own token row (by token value) so the
-- validate endpoint can confirm token existence and survey linkage.
-- No other rows are visible (the WHERE clause acts as a filter).
CREATE POLICY "anon_validate_token" ON participation_tokens
  FOR SELECT
  TO anon, authenticated
  USING (token = current_setting('app.submission_token', true));

-- INSERT/UPDATE/DELETE: service_role only (bypasses RLS automatically)
-- Deny all other mutations from public roles
CREATE POLICY "admin_manage_tokens" ON participation_tokens
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "tokens_no_public_update" ON participation_tokens
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false);

CREATE POLICY "tokens_no_public_delete" ON participation_tokens
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ============================================================
-- STAFF table
-- ============================================================

-- No access for public roles — staff data is sensitive PII.
-- All staff queries go through service_role (bypasses RLS).
CREATE POLICY "staff_no_public_access" ON staff
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ============================================================
-- DEPARTMENTS table
-- ============================================================

-- Authenticated admins can read department list (for UI selectors)
CREATE POLICY "departments_authenticated_read" ON departments
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon cannot read departments (no department info needed in survey flow)
CREATE POLICY "departments_no_anon_access" ON departments
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false);

-- ============================================================
-- SURVEYS table
-- ============================================================

-- Authenticated (admin) can read all surveys
CREATE POLICY "surveys_authenticated_read" ON surveys
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon can only read the survey linked to their valid token
-- (used in the survey completion flow to fetch survey details)
CREATE POLICY "surveys_anon_read_by_token" ON surveys
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM participation_tokens pt
      WHERE pt.survey_id = surveys.id
        AND pt.token = current_setting('app.submission_token', true)
        AND pt.used_at IS NULL
    )
  );

-- ============================================================
-- QUESTIONS table
-- ============================================================

-- Authenticated (admin) can read all questions
CREATE POLICY "questions_authenticated_read" ON questions
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon can only read questions for a survey they have a valid token for
CREATE POLICY "questions_anon_read_by_token" ON questions
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM participation_tokens pt
      WHERE pt.survey_id = questions.survey_id
        AND pt.token = current_setting('app.submission_token', true)
        AND pt.used_at IS NULL
    )
  );

-- ============================================================
-- Comment: Single-use token enforcement
-- When a response is submitted, the API route (using service_role) atomically:
--   1. Inserts all response rows
--   2. Sets participation_tokens.used_at = now() WHERE token = <token>
-- The DB-level guard (is_valid_unused_token) ensures that even if the
-- application layer is bypassed, a used token cannot produce a second INSERT.
-- ============================================================
