-- Development seed data for local Supabase instance
-- Run via: supabase db reset (applies migrations + this seed file)
-- Or manually: psql -h localhost -p 54322 -U postgres -d postgres -f supabase/seed.sql

-- Departments (hierarchical: Engineering > Frontend / Backend, Clinical > Nursing / Allied Health)
INSERT INTO departments (id, name, parent_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Engineering', NULL),
  ('00000000-0000-0000-0000-000000000002', 'Frontend', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', 'Backend', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', 'Clinical', NULL),
  ('00000000-0000-0000-0000-000000000005', 'Nursing', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000006', 'Allied Health', '00000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Staff (linked to departments)
INSERT INTO staff (id, email, name, department_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'alice@example.com', 'Alice Smith', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob Jones', '00000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', 'carol@example.com', 'Carol Williams', '00000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000004', 'dave@example.com', 'Dave Brown', '00000000-0000-0000-0000-000000000006')
ON CONFLICT (id) DO NOTHING;

-- Survey
INSERT INTO surveys (id, title, description, status, start_date, end_date) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    'Q1 2026 Engagement Survey',
    'Annual staff engagement survey for Q1 2026. Your responses are anonymous.',
    'open',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '30 days'
  )
ON CONFLICT (id) DO NOTHING;

-- Questions
INSERT INTO questions (id, survey_id, type, text, options, order_index, required) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'likert',
    'I feel valued and recognised for my contributions.',
    NULL,
    1,
    TRUE
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'likert',
    'I have the tools and resources I need to do my job effectively.',
    NULL,
    2,
    TRUE
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'likert',
    'My manager communicates clear expectations.',
    NULL,
    3,
    TRUE
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    'multiple_choice',
    'How would you describe the overall culture at Ausmed?',
    '["Collaborative", "Supportive", "High-pressure", "Disconnected", "Innovative"]',
    4,
    FALSE
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    'free_text',
    'What is one thing we could do to improve your day-to-day experience?',
    NULL,
    5,
    FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- Participation tokens (one per staff member for the seed survey)
INSERT INTO participation_tokens (id, staff_id, survey_id, token) VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'dev-token-alice-001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'dev-token-bob-002'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'dev-token-carol-003'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    'dev-token-dave-004'
  )
ON CONFLICT (id) DO NOTHING;
