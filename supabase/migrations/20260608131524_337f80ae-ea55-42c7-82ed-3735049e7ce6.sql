DROP POLICY IF EXISTS platform_order_events_no_user_access ON public.platform_order_events;

CREATE POLICY platform_order_events_no_select ON public.platform_order_events
  FOR SELECT TO authenticated, anon USING (false);

CREATE POLICY platform_order_events_no_insert ON public.platform_order_events
  FOR INSERT TO authenticated, anon WITH CHECK (false);

CREATE POLICY platform_order_events_no_update ON public.platform_order_events
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY platform_order_events_no_delete ON public.platform_order_events
  FOR DELETE TO authenticated, anon USING (false);