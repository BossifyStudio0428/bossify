CREATE OR REPLACE FUNCTION public.get_my_team()
RETURNS TABLE (
  id uuid,
  name text,
  plan text,
  owner_id uuid,
  current_period_end timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.plan::text, t.owner_id, t.current_period_end
  FROM public.teams t
  WHERE t.owner_id = uid
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.plan::text, t.owner_id, t.current_period_end
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = uid AND tm.status = 'active'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team() TO authenticated;