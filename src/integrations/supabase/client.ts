import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type OrderStatus = "Unpaid" | "Paid" | "Pending";

export type OrderRow = {
  id: string;
  user_id: string;
  code: string;
  customer_name: string;
  phone: string | null;
  product: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
};

export type InventoryRow = {
  id: string;
  user_id: string;
  name: string;
  stock: number;
  unit: string;
  max_stock: number;
  price: number;
  created_at: string;
};

export type CustomerRow = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  business_name: string | null;
  plan: string | null;
  created_at: string;
};