CREATE POLICY "platform_order_events_no_user_access"
ON public.platform_order_events
FOR ALL
TO authenticated
USING (false);