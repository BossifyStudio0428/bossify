ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.dine_in_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_ticket_id_idx ON public.orders(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_ticket_id_uniq ON public.orders(ticket_id) WHERE ticket_id IS NOT NULL;