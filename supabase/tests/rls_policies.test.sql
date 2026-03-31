-- Schema and RLS policy verification tests
-- Run via psql with -v ON_ERROR_STOP=1
-- Uses DO blocks with RAISE EXCEPTION for assertion failures

-- ============================================================
-- 1. Table existence checks
-- ============================================================
DO $$
BEGIN
  -- Verify all core tables exist
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='responses'),
    'FAIL: responses table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='participation_tokens'),
    'FAIL: participation_tokens table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='departments'),
    'FAIL: departments table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff'),
    'FAIL: staff table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='surveys'),
    'FAIL: surveys table missing';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='questions'),
    'FAIL: questions table missing';
  RAISE NOTICE 'PASS: All 6 core tables exist';
END;
$$;

-- ============================================================
-- 2. Column existence and type checks
-- ============================================================
DO $$
BEGIN
  -- responses.answer must be text (not jsonb — anonymity enforced via separate rows)
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='responses'
      AND column_name='answer' AND data_type='text'
  ), 'FAIL: responses.answer text column missing';

  -- responses must NOT have staff_id (anonymity enforcement)
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='responses' AND column_name='staff_id'
  ), 'FAIL: responses.staff_id must not exist — anonymity violated';

  -- responses must have department_id for analytics
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='responses' AND column_name='department_id'
  ), 'FAIL: responses.department_id missing';

  -- participation_tokens must have used_at for token burn tracking
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='participation_tokens' AND column_name='used_at'
  ), 'FAIL: participation_tokens.used_at missing';

  -- questions.order_index must exist and be integer
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='questions'
      AND column_name='order_index' AND data_type='integer'
  ), 'FAIL: questions.order_index integer column missing';

  -- surveys.status must exist
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='surveys' AND column_name='status'
  ), 'FAIL: surveys.status column missing';

  -- departments.parent_id for hierarchy
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='departments' AND column_name='parent_id'
  ), 'FAIL: departments.parent_id missing';

  RAISE NOTICE 'PASS: Column existence and type checks passed';
END;
$$;

-- ============================================================
-- 3. RLS enabled checks
-- ============================================================
DO $$
BEGIN
  -- RLS must be enabled on sensitive tables
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname='responses' AND relnamespace='public'::regnamespace),
    'FAIL: RLS not enabled on responses';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname='participation_tokens' AND relnamespace='public'::regnamespace),
    'FAIL: RLS not enabled on participation_tokens';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname='staff' AND relnamespace='public'::regnamespace),
    'FAIL: RLS not enabled on staff';
  RAISE NOTICE 'PASS: RLS enabled on all sensitive tables';
END;
$$;

-- ============================================================
-- 4. RLS policy existence checks
-- ============================================================
DO $$
BEGIN
  -- responses policies
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='responses' AND policyname='anon_insert_with_token'
  ), 'FAIL: responses policy anon_insert_with_token missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='responses' AND policyname='admin_read_all'
  ), 'FAIL: responses policy admin_read_all missing';

  -- participation_tokens policies
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='participation_tokens' AND policyname='anon_validate_token'
  ), 'FAIL: participation_tokens policy anon_validate_token missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='participation_tokens' AND policyname='admin_manage_tokens'
  ), 'FAIL: participation_tokens policy admin_manage_tokens missing';

  RAISE NOTICE 'PASS: Expected RLS policies exist';
END;
$$;

-- ============================================================
-- 5. submit_survey_response function exists
-- ============================================================
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname='submit_survey_response'
      AND pronamespace='public'::regnamespace
  ), 'FAIL: submit_survey_response function missing';
  RAISE NOTICE 'PASS: submit_survey_response function exists';
END;
$$;

-- ============================================================
-- 6. Unique constraint checks
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  -- participation_tokens.token must be unique
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname='public' AND tablename='participation_tokens'
    AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%token%';

  -- Also check via information_schema
  IF v_count = 0 THEN
    SELECT COUNT(*) INTO v_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema='public' AND tc.table_name='participation_tokens'
      AND ccu.column_name='token'
      AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY');
  END IF;

  ASSERT v_count > 0, 'FAIL: participation_tokens.token must be unique';

  RAISE NOTICE 'PASS: Unique constraints verified';
END;
$$;

\echo 'All schema and RLS policy tests PASSED.'
