import { createClient } from "@supabase/supabase-js";
import { safeLocalStorage } from "@/lib/safeStorage";

const SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: safeLocalStorage,
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
  delivery_address?: string | null;
  created_at: string;
  cost?: number;
  gross_profit?: number;
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
  cost_price?: number;
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
  remarks?: string | null;
  customer_status?: CustomerStatus | null;
  package_id?: string | null;
  package_name?: string | null;
};

export type CustomerStatus = "enquiry" | "in_progress" | "completed" | "rejected";

export type FollowUpRow = {
  id: string;
  user_id: string;
  customer_id: string;
  follow_up_date: string; // YYYY-MM-DD
  note: string | null;
  is_done: boolean;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  business_name: string | null;
  plan: string | null;
  created_at: string;
  payment_method_1_type?: string | null;
  payment_method_1_number?: string | null;
  payment_method_1_name?: string | null;
  payment_method_1_qr_url?: string | null;
  payment_method_2_type?: string | null;
  payment_method_2_number?: string | null;
  payment_method_2_name?: string | null;
  payment_method_2_qr_url?: string | null;
};