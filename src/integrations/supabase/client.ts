import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_e_9MEqLvkCopOTpcHh9x-Q_ldH-tes3lovable";

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