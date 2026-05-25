export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_education_details: {
        Row: {
          academic_result: string | null
          application_status: string | null
          client_id: string
          course_interest: string | null
          created_at: string
          family_income: string | null
          id: string
          scholarship_interest: boolean | null
          university_preference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_result?: string | null
          application_status?: string | null
          client_id: string
          course_interest?: string | null
          created_at?: string
          family_income?: string | null
          id?: string
          scholarship_interest?: boolean | null
          university_preference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_result?: string | null
          application_status?: string | null
          client_id?: string
          course_interest?: string | null
          created_at?: string
          family_income?: string | null
          id?: string
          scholarship_interest?: boolean | null
          university_preference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          id: string
          last_order_at: string | null
          name: string
          phone: string | null
          total_orders: number
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_order_at?: string | null
          name: string
          phone?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_order_at?: string | null
          name?: string
          phone?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          created_at: string
          customer_id: string
          follow_up_date: string
          id: string
          is_done: boolean
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          follow_up_date: string
          id?: string
          is_done?: boolean
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          follow_up_date?: string
          id?: string
          is_done?: boolean
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price: number
          stock: number
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price?: number
          stock?: number
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price?: number
          stock?: number
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          code: string
          created_at: string
          customer_name: string
          id: string
          notes: string | null
          order_source: string
          phone: string | null
          platform_metadata: Json | null
          platform_order_id: string | null
          product: string
          quantity: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          customer_name: string
          id?: string
          notes?: string | null
          order_source?: string
          phone?: string | null
          platform_metadata?: Json | null
          platform_order_id?: string | null
          product: string
          quantity?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          customer_name?: string
          id?: string
          notes?: string | null
          order_source?: string
          phone?: string | null
          platform_metadata?: Json | null
          platform_order_id?: string | null
          product?: string
          quantity?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string | null
          connected_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          platform: string
          platform_shop_id: string | null
          platform_shop_name: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          platform: string
          platform_shop_id?: string | null
          platform_shop_name?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          platform?: string
          platform_shop_id?: string | null
          platform_shop_name?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_order_events: {
        Row: {
          event_type: string
          id: string
          order_id: string | null
          platform: string
          platform_order_id: string
          processed: boolean
          raw_payload: Json | null
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          order_id?: string | null
          platform: string
          platform_order_id: string
          processed?: boolean
          raw_payload?: Json | null
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          order_id?: string | null
          platform?: string
          platform_order_id?: string
          processed?: boolean
          raw_payload?: Json | null
          received_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_category: string | null
          business_name: string | null
          business_type: string | null
          connected_platforms: Json
          created_at: string
          id: string
          is_admin: boolean
          language: string | null
          notif_evening: boolean
          notif_inventory: boolean
          notif_milestone: boolean
          notif_morning: boolean
          notif_new_order: boolean
          notif_unpaid: boolean
          order_form_code: string | null
          order_form_enabled: boolean
          payment_method_1_bank: string | null
          payment_method_1_name: string | null
          payment_method_1_number: string | null
          payment_method_1_qr_url: string | null
          payment_method_1_type: string | null
          payment_method_2_bank: string | null
          payment_method_2_name: string | null
          payment_method_2_number: string | null
          payment_method_2_qr_url: string | null
          payment_method_2_type: string | null
          payment_platform: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_category?: string | null
          business_name?: string | null
          business_type?: string | null
          connected_platforms?: Json
          created_at?: string
          id: string
          is_admin?: boolean
          language?: string | null
          notif_evening?: boolean
          notif_inventory?: boolean
          notif_milestone?: boolean
          notif_morning?: boolean
          notif_new_order?: boolean
          notif_unpaid?: boolean
          order_form_code?: string | null
          order_form_enabled?: boolean
          payment_method_1_bank?: string | null
          payment_method_1_name?: string | null
          payment_method_1_number?: string | null
          payment_method_1_qr_url?: string | null
          payment_method_1_type?: string | null
          payment_method_2_bank?: string | null
          payment_method_2_name?: string | null
          payment_method_2_number?: string | null
          payment_method_2_qr_url?: string | null
          payment_method_2_type?: string | null
          payment_platform?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_category?: string | null
          business_name?: string | null
          business_type?: string | null
          connected_platforms?: Json
          created_at?: string
          id?: string
          is_admin?: boolean
          language?: string | null
          notif_evening?: boolean
          notif_inventory?: boolean
          notif_milestone?: boolean
          notif_morning?: boolean
          notif_new_order?: boolean
          notif_unpaid?: boolean
          order_form_code?: string | null
          order_form_enabled?: boolean
          payment_method_1_bank?: string | null
          payment_method_1_name?: string | null
          payment_method_1_number?: string | null
          payment_method_1_qr_url?: string | null
          payment_method_1_type?: string | null
          payment_method_2_bank?: string | null
          payment_method_2_name?: string | null
          payment_method_2_number?: string | null
          payment_method_2_qr_url?: string | null
          payment_method_2_type?: string | null
          payment_platform?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "services_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          count_period_start: string | null
          created_at: string
          current_period_end: string | null
          expires_at: string | null
          id: string
          inventory_created_total: number
          last_reset_at: string | null
          lifetime_activated_at: string | null
          lifetime_device_limit: number | null
          lifetime_email: string | null
          lifetime_google_token: string | null
          lifetime_purchase_date: string | null
          order_count: number
          plan: string
          provider: string | null
          provider_product_id: string | null
          provider_purchase_token: string | null
          provider_transaction_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count_period_start?: string | null
          created_at?: string
          current_period_end?: string | null
          expires_at?: string | null
          id?: string
          inventory_created_total?: number
          last_reset_at?: string | null
          lifetime_activated_at?: string | null
          lifetime_device_limit?: number | null
          lifetime_email?: string | null
          lifetime_google_token?: string | null
          lifetime_purchase_date?: string | null
          order_count?: number
          plan?: string
          provider?: string | null
          provider_product_id?: string | null
          provider_purchase_token?: string | null
          provider_transaction_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count_period_start?: string | null
          created_at?: string
          current_period_end?: string | null
          expires_at?: string | null
          id?: string
          inventory_created_total?: number
          last_reset_at?: string | null
          lifetime_activated_at?: string | null
          lifetime_device_limit?: number | null
          lifetime_email?: string | null
          lifetime_google_token?: string | null
          lifetime_purchase_date?: string | null
          order_count?: number
          plan?: string
          provider?: string | null
          provider_product_id?: string | null
          provider_purchase_token?: string | null
          provider_transaction_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          team_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          team_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          team_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          invited_email: string | null
          role: string
          status: string
          team_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          status?: string
          team_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          role?: string
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_user_data: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      device_limit_for_plan: { Args: { _plan: string }; Returns: number }
      device_limit_for_user: { Args: { _user_id: string }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      send_followup_reminders: { Args: never; Returns: undefined }
      trigger_push_kind: { Args: { _kind: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
