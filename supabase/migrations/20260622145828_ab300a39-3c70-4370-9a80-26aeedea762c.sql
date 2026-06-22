
-- =========================================================
-- 1. RESTAURANT TABLES
-- =========================================================
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  seats integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT SELECT ON public.restaurant_tables TO anon;
GRANT ALL ON public.restaurant_tables TO service_role;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their tables" ON public.restaurant_tables
  FOR ALL TO authenticated
  USING (public.can_access_user_data(user_id))
  WITH CHECK (public.can_access_user_data(user_id));

CREATE POLICY "Anyone can view active tables" ON public.restaurant_tables
  FOR SELECT TO anon
  USING (active = true);

CREATE TRIGGER trg_restaurant_tables_updated
  BEFORE UPDATE ON public.restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_restaurant_tables_user ON public.restaurant_tables(user_id);

-- =========================================================
-- 2. DINE-IN TICKETS
-- =========================================================
CREATE TABLE public.dine_in_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dine_in_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dine_in_tickets TO anon;
GRANT ALL ON public.dine_in_tickets TO service_role;
ALTER TABLE public.dine_in_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their tickets" ON public.dine_in_tickets
  FOR ALL TO authenticated
  USING (public.can_access_user_data(user_id))
  WITH CHECK (public.can_access_user_data(user_id));

CREATE POLICY "Anon can read open tickets" ON public.dine_in_tickets
  FOR SELECT TO anon
  USING (status = 'open');

CREATE POLICY "Anon can create ticket for active table" ON public.dine_in_tickets
  FOR INSERT TO anon
  WITH CHECK (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM public.restaurant_tables t
      WHERE t.id = table_id AND t.user_id = dine_in_tickets.user_id AND t.active = true
    )
  );

CREATE INDEX idx_dine_in_tickets_user_status ON public.dine_in_tickets(user_id, status);
CREATE INDEX idx_dine_in_tickets_table_status ON public.dine_in_tickets(table_id, status);

CREATE TRIGGER trg_dine_in_tickets_updated
  BEFORE UPDATE ON public.dine_in_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 3. DINE-IN ORDERS (submissions)
-- =========================================================
CREATE TABLE public.dine_in_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.dine_in_tickets(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','preparing','ready','served','cancelled')),
  note text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dine_in_orders TO authenticated;
GRANT SELECT, INSERT ON public.dine_in_orders TO anon;
GRANT ALL ON public.dine_in_orders TO service_role;
ALTER TABLE public.dine_in_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage dine-in orders" ON public.dine_in_orders
  FOR ALL TO authenticated
  USING (public.can_access_user_data(user_id))
  WITH CHECK (public.can_access_user_data(user_id));

CREATE POLICY "Anon read own ticket orders" ON public.dine_in_orders
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.dine_in_tickets t
      WHERE t.id = ticket_id AND t.status = 'open'
    )
  );

CREATE POLICY "Anon insert into open ticket" ON public.dine_in_orders
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dine_in_tickets t
      WHERE t.id = ticket_id
        AND t.status = 'open'
        AND t.user_id = dine_in_orders.user_id
        AND t.table_id = dine_in_orders.table_id
    )
  );

CREATE INDEX idx_dine_in_orders_user ON public.dine_in_orders(user_id, status);
CREATE INDEX idx_dine_in_orders_ticket ON public.dine_in_orders(ticket_id);

CREATE TRIGGER trg_dine_in_orders_updated
  BEFORE UPDATE ON public.dine_in_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 4. DINE-IN ORDER ITEMS
-- =========================================================
CREATE TABLE public.dine_in_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.dine_in_orders(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dine_in_order_items TO authenticated;
GRANT SELECT, INSERT ON public.dine_in_order_items TO anon;
GRANT ALL ON public.dine_in_order_items TO service_role;
ALTER TABLE public.dine_in_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage dine-in items" ON public.dine_in_order_items
  FOR ALL TO authenticated
  USING (public.can_access_user_data(user_id))
  WITH CHECK (public.can_access_user_data(user_id));

CREATE POLICY "Anon read items via open ticket" ON public.dine_in_order_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.dine_in_orders o
      JOIN public.dine_in_tickets t ON t.id = o.ticket_id
      WHERE o.id = order_id AND t.status = 'open'
    )
  );

CREATE POLICY "Anon insert items into open order" ON public.dine_in_order_items
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dine_in_orders o
      JOIN public.dine_in_tickets t ON t.id = o.ticket_id
      WHERE o.id = order_id
        AND t.status = 'open'
        AND o.user_id = dine_in_order_items.user_id
    )
  );

CREATE INDEX idx_dine_in_items_order ON public.dine_in_order_items(order_id);

-- =========================================================
-- 5. INVENTORY → INGREDIENTS RECIPE LINKAGE
-- =========================================================
CREATE TABLE public.inventory_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity_per_unit numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, ingredient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_recipe_items TO authenticated;
GRANT ALL ON public.inventory_recipe_items TO service_role;
ALTER TABLE public.inventory_recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage recipes" ON public.inventory_recipe_items
  FOR ALL TO authenticated
  USING (public.can_access_user_data(user_id))
  WITH CHECK (public.can_access_user_data(user_id));

CREATE INDEX idx_inv_recipe_inventory ON public.inventory_recipe_items(inventory_id);

CREATE TRIGGER trg_inv_recipe_updated
  BEFORE UPDATE ON public.inventory_recipe_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- 6. TICKET TOTAL SYNC
-- =========================================================
CREATE OR REPLACE FUNCTION public.recalc_dine_in_ticket_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket uuid;
BEGIN
  _ticket := COALESCE(NEW.ticket_id, OLD.ticket_id);
  IF _ticket IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.dine_in_tickets
    SET total_amount = COALESCE((
      SELECT SUM(o.total_amount) FROM public.dine_in_orders o
      WHERE o.ticket_id = _ticket AND o.status <> 'cancelled'
    ), 0)
  WHERE id = _ticket;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalc_ticket_total
  AFTER INSERT OR UPDATE OR DELETE ON public.dine_in_orders
  FOR EACH ROW EXECUTE FUNCTION public.recalc_dine_in_ticket_total();

-- =========================================================
-- 7. PUSH NOTIFICATION ON NEW DINE-IN ORDER
-- =========================================================
CREATE OR REPLACE FUNCTION public.notify_new_dine_in_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _endpoint text := 'https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push';
  _secret text;
  _label text;
  _request_id bigint;
BEGIN
  SELECT decrypted_secret INTO _secret
  FROM vault.decrypted_secrets WHERE name = 'PUSH_WEBHOOK_SECRET' LIMIT 1;
  IF _secret IS NULL THEN RETURN NEW; END IF;

  SELECT label INTO _label FROM public.restaurant_tables WHERE id = NEW.table_id;

  SELECT net.http_post(
    url := _endpoint,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',_secret),
    body := jsonb_build_object(
      'kind','new_order',
      'targetUserId', NEW.user_id,
      'link', '/dine-in',
      'vars', jsonb_build_object(
        'customer', COALESCE(_label,'Table'),
        'product', 'Dine-in order',
        'amount', to_char(COALESCE(NEW.total_amount,0),'FM999999990.00')
      )
    ),
    timeout_milliseconds := 10000
  ) INTO _request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_dine_in_order
  AFTER INSERT ON public.dine_in_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_dine_in_order();

-- =========================================================
-- 8. INGREDIENT / STOCK DEDUCTION ON TICKET PAID
-- =========================================================
CREATE OR REPLACE FUNCTION public.deduct_on_ticket_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item record;
  _recipe_count integer;
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid' THEN
    FOR _item IN
      SELECT i.inventory_id, i.product_name, SUM(i.quantity) AS qty
      FROM public.dine_in_order_items i
      JOIN public.dine_in_orders o ON o.id = i.order_id
      WHERE o.ticket_id = NEW.id AND o.status <> 'cancelled'
      GROUP BY i.inventory_id, i.product_name
    LOOP
      IF _item.inventory_id IS NOT NULL THEN
        SELECT count(*) INTO _recipe_count
        FROM public.inventory_recipe_items
        WHERE inventory_id = _item.inventory_id;

        IF _recipe_count > 0 THEN
          UPDATE public.ingredients ing
            SET current_stock = GREATEST(0, ing.current_stock - (r.quantity_per_unit * _item.qty))
          FROM public.inventory_recipe_items r
          WHERE r.ingredient_id = ing.id
            AND r.inventory_id = _item.inventory_id
            AND ing.user_id = NEW.user_id;
        ELSE
          UPDATE public.inventory
            SET stock = GREATEST(0, stock - _item.qty)
          WHERE id = _item.inventory_id AND user_id = NEW.user_id;
        END IF;
      ELSE
        UPDATE public.inventory
          SET stock = GREATEST(0, stock - _item.qty)
        WHERE user_id = NEW.user_id
          AND lower(btrim(name)) = lower(btrim(_item.product_name));
      END IF;
    END LOOP;

    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deduct_on_ticket_paid
  BEFORE UPDATE ON public.dine_in_tickets
  FOR EACH ROW EXECUTE FUNCTION public.deduct_on_ticket_paid();

-- =========================================================
-- 9. ALLOW 'dine_in' ORDER SOURCE FOR CHECKOUT INTEGRATION
-- =========================================================
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_source_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check
  CHECK (order_source = ANY (ARRAY['manual','online_form','tiktok','shopee','lazada','facebook','instagram','dine_in']));

-- =========================================================
-- 10. PUBLIC MENU HELPER (anon-safe)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_dine_in_menu(_table_id uuid)
RETURNS TABLE(
  inventory_id uuid,
  name text,
  description text,
  price numeric,
  image_url text,
  cover_image_url text,
  category text,
  stock integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.name, i.description, i.price, i.image_url, i.cover_image_url, i.category, i.stock
  FROM public.inventory i
  JOIN public.restaurant_tables t ON t.user_id = i.user_id
  WHERE t.id = _table_id AND t.active = true
  ORDER BY i.category NULLS LAST, i.name;
$$;
GRANT EXECUTE ON FUNCTION public.get_dine_in_menu(uuid) TO anon, authenticated;
