
-- Attach protection triggers (functions already exist)
DROP TRIGGER IF EXISTS trg_protect_subscription_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields();

DROP TRIGGER IF EXISTS trg_protect_subscription_fields_insert ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_fields_insert
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_fields_insert();

DROP TRIGGER IF EXISTS trg_protect_lifetime_fields ON public.subscriptions;
CREATE TRIGGER trg_protect_lifetime_fields
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_lifetime_fields();

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- platform_connections: managed by server (service_role); explicitly deny client INSERT/UPDATE
CREATE POLICY "platform_connections_no_client_insert"
  ON public.platform_connections FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "platform_connections_no_client_update"
  ON public.platform_connections FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
