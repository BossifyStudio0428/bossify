-- Tighten subscriptions: users should never UPDATE their own subscription row
-- via the Data API. All meaningful fields were already pinned via WITH CHECK
-- and a SECURITY DEFINER trigger, but the policy did not pin provider/lifetime
-- columns. Simplest secure fix: drop the user UPDATE policy entirely. Server
-- code uses the service role which bypasses RLS, so legitimate billing
-- updates still work.

DROP POLICY IF EXISTS subscriptions_update_own ON public.subscriptions;