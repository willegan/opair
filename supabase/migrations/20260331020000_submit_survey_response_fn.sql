-- Migration: Atomic survey response submission function
-- Wraps response insertion + token burn in a single transaction
-- to prevent double-submission if the process crashes between the two operations.

CREATE OR REPLACE FUNCTION submit_survey_response(
  p_token_id  uuid,
  p_survey_id uuid,
  p_responses jsonb  -- array of {question_id, answer, department_id}
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
BEGIN
  -- Burn the token atomically: DELETE returns nothing if already used/missing
  DELETE FROM public.participation_tokens
  WHERE id = p_token_id
    AND survey_id = p_survey_id
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_or_used_token'
      USING HINT = 'Token not found, already used, or does not belong to this survey';
  END IF;

  -- Insert all response rows
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    INSERT INTO public.responses (survey_id, question_id, answer, department_id)
    VALUES (
      p_survey_id,
      (v_row->>'question_id')::uuid,
      v_row->>'answer',
      (v_row->>'department_id')::uuid
    );
  END LOOP;
END;
$$;

-- Allow the service role to call this function
GRANT EXECUTE ON FUNCTION submit_survey_response(uuid, uuid, jsonb) TO service_role;
