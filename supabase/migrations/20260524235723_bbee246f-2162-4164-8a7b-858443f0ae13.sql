
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_platform_order_unique
  ON public.orders(user_id, platform_order_id)
  WHERE platform_order_id IS NOT NULL;
