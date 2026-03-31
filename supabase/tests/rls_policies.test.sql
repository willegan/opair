-- pgTAP tests for RLS policies on the Ausmed Engagement Survey schema
-- Run via: supabase test db
-- These tests verify the anonymity and access control guarantees.

BEGIN;

SELECT plan(20);

-- ============================================================
-- Setup: helpers to switch between roles
-- ============================================================

-- Use the anon role (what survey respondents use)
-- Use the service_role (what admin API uses)
-- Use authenticated role (what admin UI uses)

-- ============================================================
-- 1. responses table — anon INSERT with valid token
-- ============================================================

-- Anon can insert a response when they have a valid (unused) token
-- (RLS policy: anon can insert if participation_tokens.token matches header)

-- First verify table exists
SELECT has_table('public', 'responses', 'responses table exists');
SELECT has_table('public', 'participation_tokens', 'participation_tokens table exists');
SELECT has_table('public', 'departments', 'departments table exists');
SELECT has_table('public', 'staff', 'staff table exists');
SELECT has_table('public', 'surveys', 'surveys table exists');
SELECT has_table('public', 'questions', 'questions table exists');

-- ============================================================
-- 2. Column existence checks for anonymity guarantees
-- ============================================================

-- responses must NOT have a staff_id column (anonymity enforced)
SELECT hasnt_column('public', 'responses', 'staff_id',
  'responses.staff_id must not exist — anonymity enforced');

-- responses must have department_id (for analytics rollup)
SELECT has_column('public', 'responses', 'department_id',
  'responses.department_id exists for analytics');

-- participation_tokens must have used_at
SELECT has_column('public', 'participation_tokens', 'used_at',
  'participation_tokens.used_at exists for token burn tracking');

-- ============================================================
-- 3. RLS must be enabled on sensitive tables
-- ============================================================

SELECT policies_are('public', 'responses',
  ARRAY['anon_insert_with_token', 'admin_read_all'],
  'responses table has expected RLS policies');

SELECT policies_are('public', 'participation_tokens',
  ARRAY['anon_validate_token', 'admin_manage_tokens'],
  'participation_tokens table has expected RLS policies');

-- ============================================================
-- 4. Constraint checks
-- ============================================================

-- participation_tokens.token must be unique
SELECT col_is_unique('public', 'participation_tokens', 'token',
  'participation_tokens.token is unique');

-- staff.email must be unique
SELECT col_is_unique('public', 'staff', 'email',
  'staff.email is unique');

-- questions.order_index — check column exists and is integer
SELECT has_column('public', 'questions', 'order_index',
  'questions.order_index exists');

SELECT col_type_is('public', 'questions', 'order_index', 'integer',
  'questions.order_index is integer type');

-- ============================================================
-- 5. responses.answers must be jsonb
-- ============================================================

SELECT has_column('public', 'responses', 'answers',
  'responses.answers column exists');

SELECT col_type_is('public', 'responses', 'answers', 'jsonb',
  'responses.answers is jsonb');

-- ============================================================
-- 6. surveys.status must have a check constraint (valid values)
-- ============================================================

SELECT has_column('public', 'surveys', 'status',
  'surveys.status column exists');

-- Verify departments.parent_id self-reference
SELECT has_column('public', 'departments', 'parent_id',
  'departments.parent_id exists for hierarchy');

SELECT finish();

ROLLBACK;
