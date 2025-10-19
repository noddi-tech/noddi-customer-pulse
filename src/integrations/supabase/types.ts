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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          booking_items: Json | null
          completed_at: string | null
          date: string | null
          id: number
          is_cancelled: boolean | null
          is_fully_paid: boolean | null
          is_fully_unable_to_complete: boolean | null
          is_partially_unable_to_complete: boolean | null
          started_at: string | null
          status_label: string | null
          updated_at: string | null
          user_group_id: number | null
          user_id: number | null
        }
        Insert: {
          booking_items?: Json | null
          completed_at?: string | null
          date?: string | null
          id: number
          is_cancelled?: boolean | null
          is_fully_paid?: boolean | null
          is_fully_unable_to_complete?: boolean | null
          is_partially_unable_to_complete?: boolean | null
          started_at?: string | null
          status_label?: string | null
          updated_at?: string | null
          user_group_id?: number | null
          user_id?: number | null
        }
        Update: {
          booking_items?: Json | null
          completed_at?: string | null
          date?: string | null
          id?: number
          is_cancelled?: boolean | null
          is_fully_paid?: boolean | null
          is_fully_unable_to_complete?: boolean | null
          is_partially_unable_to_complete?: boolean | null
          started_at?: string | null
          status_label?: string | null
          updated_at?: string | null
          user_group_id?: number | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          id: number
          language_code: string | null
          last_name: string | null
          phone: string | null
          updated_at: string | null
          user_group_id: number | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id: number
          language_code?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_group_id?: number | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: number
          language_code?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_group_id?: number | null
        }
        Relationships: []
      }
      features: {
        Row: {
          computed_at: string | null
          discount_share_24m: number | null
          frequency_24m: number | null
          fully_paid_rate: number | null
          last_booking_at: string | null
          last_dekkskift_at: string | null
          margin_24m: number | null
          recency_days: number | null
          revenue_24m: number | null
          seasonal_due_at: string | null
          service_counts: Json | null
          service_tags_all: Json | null
          storage_active: boolean | null
          user_group_id: number
          user_id: number | null
        }
        Insert: {
          computed_at?: string | null
          discount_share_24m?: number | null
          frequency_24m?: number | null
          fully_paid_rate?: number | null
          last_booking_at?: string | null
          last_dekkskift_at?: string | null
          margin_24m?: number | null
          recency_days?: number | null
          revenue_24m?: number | null
          seasonal_due_at?: string | null
          service_counts?: Json | null
          service_tags_all?: Json | null
          storage_active?: boolean | null
          user_group_id: number
          user_id?: number | null
        }
        Update: {
          computed_at?: string | null
          discount_share_24m?: number | null
          frequency_24m?: number | null
          fully_paid_rate?: number | null
          last_booking_at?: string | null
          last_dekkskift_at?: string | null
          margin_24m?: number | null
          recency_days?: number | null
          revenue_24m?: number | null
          seasonal_due_at?: string | null
          service_counts?: Json | null
          service_tags_all?: Json | null
          storage_active?: boolean | null
          user_group_id?: number
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "features_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "features_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          amount_gross: number | null
          amount_vat: number | null
          booking_id: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          is_delivery_fee: boolean | null
          is_discount: boolean | null
          quantity: number | null
          sales_item_id: number | null
        }
        Insert: {
          amount_gross?: number | null
          amount_vat?: number | null
          booking_id?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_delivery_fee?: boolean | null
          is_discount?: boolean | null
          quantity?: number | null
          sales_item_id?: number | null
        }
        Update: {
          amount_gross?: number | null
          amount_vat?: number | null
          booking_id?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_delivery_fee?: boolean | null
          is_discount?: boolean | null
          quantity?: number | null
          sales_item_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "active_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          lifecycle: string | null
          previous_lifecycle: string | null
          tags: Json | null
          updated_at: string | null
          user_group_id: number
          user_id: number | null
          value_tier: string | null
        }
        Insert: {
          lifecycle?: string | null
          previous_lifecycle?: string | null
          tags?: Json | null
          updated_at?: string | null
          user_group_id: number
          user_id?: number | null
          value_tier?: string | null
        }
        Update: {
          lifecycle?: string | null
          previous_lifecycle?: string | null
          tags?: Json | null
          updated_at?: string | null
          user_group_id?: number
          user_id?: number | null
          value_tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      storage_status: {
        Row: {
          ended_at: string | null
          is_active: boolean | null
          updated_at: string | null
          user_group_id: number
        }
        Insert: {
          ended_at?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          user_group_id: number
        }
        Update: {
          ended_at?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          user_group_id?: number
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          auto_sync_enabled: boolean | null
          current_page: number | null
          error_message: string | null
          estimated_completion_at: string | null
          estimated_total: number | null
          high_watermark: string | null
          last_run_at: string | null
          max_id_seen: number | null
          progress_percentage: number | null
          resource: string
          rows_fetched: number | null
          status: string | null
          sync_mode: string | null
          total_records: number | null
        }
        Insert: {
          auto_sync_enabled?: boolean | null
          current_page?: number | null
          error_message?: string | null
          estimated_completion_at?: string | null
          estimated_total?: number | null
          high_watermark?: string | null
          last_run_at?: string | null
          max_id_seen?: number | null
          progress_percentage?: number | null
          resource: string
          rows_fetched?: number | null
          status?: string | null
          sync_mode?: string | null
          total_records?: number | null
        }
        Update: {
          auto_sync_enabled?: boolean | null
          current_page?: number | null
          error_message?: string | null
          estimated_completion_at?: string | null
          estimated_total?: number | null
          high_watermark?: string | null
          last_run_at?: string | null
          max_id_seen?: number | null
          progress_percentage?: number | null
          resource?: string
          rows_fetched?: number | null
          status?: string | null
          sync_mode?: string | null
          total_records?: number | null
        }
        Relationships: []
      }
      user_groups: {
        Row: {
          created_at: string | null
          id: number
          is_personal: boolean | null
          name: string | null
          org_id: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: number
          is_personal?: boolean | null
          name?: string | null
          org_id?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_personal?: boolean | null
          name?: string | null
          org_id?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      active_bookings: {
        Row: {
          booking_items: Json | null
          completed_at: string | null
          date: string | null
          id: number | null
          is_cancelled: boolean | null
          is_fully_paid: boolean | null
          is_fully_unable_to_complete: boolean | null
          is_partially_unable_to_complete: boolean | null
          started_at: string | null
          status_label: string | null
          updated_at: string | null
          user_group_id: number | null
          user_id: number | null
        }
        Insert: {
          booking_items?: Json | null
          completed_at?: string | null
          date?: string | null
          id?: number | null
          is_cancelled?: boolean | null
          is_fully_paid?: boolean | null
          is_fully_unable_to_complete?: boolean | null
          is_partially_unable_to_complete?: boolean | null
          started_at?: string | null
          status_label?: string | null
          updated_at?: string | null
          user_group_id?: number | null
          user_id?: number | null
        }
        Update: {
          booking_items?: Json | null
          completed_at?: string | null
          date?: string | null
          id?: number | null
          is_cancelled?: boolean | null
          is_fully_paid?: boolean | null
          is_fully_unable_to_complete?: boolean | null
          is_partially_unable_to_complete?: boolean | null
          started_at?: string | null
          status_label?: string | null
          updated_at?: string | null
          user_group_id?: number | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      active_customers: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          id: number | null
          language_code: string | null
          last_name: string | null
          phone: string | null
          updated_at: string | null
          user_group_id: number | null
        }
        Relationships: []
      }
      active_order_lines: {
        Row: {
          amount_gross: number | null
          amount_vat: number | null
          booking_id: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string | null
          is_delivery_fee: boolean | null
          is_discount: boolean | null
          quantity: number | null
          sales_item_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "active_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_churn_timeline: {
        Args: Record<PropertyKey, never>
        Returns: {
          churn_period: string
          customer_count: number
          period_order: number
        }[]
      }
      get_lifecycle_insights: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_frequency_24m: number
          avg_margin_24m: number
          avg_recency_days: number
          avg_revenue_24m: number
          customer_count: number
          lifecycle: string
        }[]
      }
      get_product_line_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_segment_counts: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
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
