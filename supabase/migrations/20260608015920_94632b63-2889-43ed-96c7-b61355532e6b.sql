
-- Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select_own" ON public.suppliers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "suppliers_insert_own" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_update_own" ON public.suppliers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_delete_own" ON public.suppliers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Ingredients (FnB raw materials)
CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  cost_per_unit numeric NOT NULL DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingredients_select_own" ON public.ingredients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ingredients_insert_own" ON public.ingredients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingredients_update_own" ON public.ingredients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ingredients_delete_own" ON public.ingredients FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Purchase orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_select_own" ON public.purchase_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "po_insert_own" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "po_update_own" ON public.purchase_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "po_delete_own" ON public.purchase_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Purchase order items (polymorphic: ingredient_id for FnB, inventory_id for Retail)
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE SET NULL,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  name text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poi_target_check CHECK (ingredient_id IS NOT NULL OR inventory_id IS NOT NULL OR name IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_select_via_po" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.user_id = auth.uid()));
CREATE POLICY "poi_insert_via_po" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.user_id = auth.uid()));
CREATE POLICY "poi_update_via_po" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.user_id = auth.uid()));
CREATE POLICY "poi_delete_via_po" ON public.purchase_order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND po.user_id = auth.uid()));

CREATE INDEX idx_suppliers_user ON public.suppliers(user_id);
CREATE INDEX idx_ingredients_user ON public.ingredients(user_id);
CREATE INDEX idx_po_user_date ON public.purchase_orders(user_id, order_date DESC);
CREATE INDEX idx_poi_po ON public.purchase_order_items(purchase_order_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ingredients_updated BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
