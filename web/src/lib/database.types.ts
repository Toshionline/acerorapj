export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      devin_jobs: {
        Row: {
          completed_at: string | null
          devin_session_id: string | null
          error_message: string | null
          id: string
          pr_url: string | null
          session_url: string | null
          source_id: string | null
          started_at: string | null
          status: string
          steps: Json
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          devin_session_id?: string | null
          error_message?: string | null
          id?: string
          pr_url?: string | null
          session_url?: string | null
          source_id?: string | null
          started_at?: string | null
          status?: string
          steps?: Json
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          devin_session_id?: string | null
          error_message?: string | null
          id?: string
          pr_url?: string | null
          session_url?: string | null
          source_id?: string | null
          started_at?: string | null
          status?: string
          steps?: Json
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devin_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "integration_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sources: {
        Row: {
          contact_email: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          sample_csv: string | null
          source_type: string
          spec_url: string | null
          status: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sample_csv?: string | null
          source_type: string
          spec_url?: string | null
          status?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sample_csv?: string | null
          source_type?: string
          spec_url?: string | null
          status?: string
        }
        Relationships: []
      }
      item_media: {
        Row: {
          created_at: string
          id: string
          item_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: string
          condition: string | null
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          location: unknown
          owner_org_id: string
          pickup_deadline: string | null
          quantity: number
          status: string
          title: string
        }
        Insert: {
          category: string
          condition?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          location?: unknown
          owner_org_id: string
          pickup_deadline?: string | null
          quantity: number
          status?: string
          title: string
        }
        Update: {
          category?: string
          condition?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          location?: unknown
          owner_org_id?: string
          pickup_deadline?: string | null
          quantity?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          accepted_at: string | null
          asset_score: number
          created_at: string
          distance_km: number | null
          donor_accepted_at: string | null
          donor_org_id: string
          geo_score: number
          id: string
          item_id: string
          need_id: string
          reason: string | null
          reason_generated_at: string | null
          recipient_accepted_at: string | null
          recipient_org_id: string
          service_note: string | null
          service_score: number
          status: string
          total_score: number
          trust_score: number
          urgency_score: number
        }
        Insert: {
          accepted_at?: string | null
          asset_score?: number
          created_at?: string
          distance_km?: number | null
          donor_accepted_at?: string | null
          donor_org_id: string
          geo_score?: number
          id?: string
          item_id: string
          need_id: string
          reason?: string | null
          reason_generated_at?: string | null
          recipient_accepted_at?: string | null
          recipient_org_id: string
          service_note?: string | null
          service_score?: number
          status?: string
          total_score?: number
          trust_score?: number
          urgency_score?: number
        }
        Update: {
          accepted_at?: string | null
          asset_score?: number
          created_at?: string
          distance_km?: number | null
          donor_accepted_at?: string | null
          donor_org_id?: string
          geo_score?: number
          id?: string
          item_id?: string
          need_id?: string
          reason?: string | null
          reason_generated_at?: string | null
          recipient_accepted_at?: string | null
          recipient_org_id?: string
          service_note?: string | null
          service_score?: number
          status?: string
          total_score?: number
          trust_score?: number
          urgency_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "matches_donor_org_id_fkey"
            columns: ["donor_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_need_id_fkey"
            columns: ["need_id"]
            isOneToOne: false
            referencedRelation: "needs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_recipient_org_id_fkey"
            columns: ["recipient_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      needs: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          latest_needed_at: string | null
          location: unknown
          max_distance_km: number | null
          org_id: string
          quantity: number | null
          status: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          latest_needed_at?: string | null
          location?: unknown
          max_distance_km?: number | null
          org_id: string
          quantity?: number | null
          status?: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          latest_needed_at?: string | null
          location?: unknown
          max_distance_km?: number | null
          org_id?: string
          quantity?: number | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "needs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_locations: {
        Row: {
          access_note: string | null
          contact_name: string | null
          contact_phone: string | null
          exact_address: string
          org_id: string
        }
        Insert: {
          access_note?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          exact_address: string
          org_id: string
        }
        Update: {
          access_note?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          exact_address?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          area_label: string | null
          completed_transfers: number
          created_at: string
          id: string
          location: unknown
          name: string
          nearest_station: string | null
          org_type: string
          relay_credits: number
          verified: boolean
        }
        Insert: {
          area_label?: string | null
          completed_transfers?: number
          created_at?: string
          id?: string
          location?: unknown
          name: string
          nearest_station?: string | null
          org_type: string
          relay_credits?: number
          verified?: boolean
        }
        Update: {
          area_label?: string | null
          completed_transfers?: number
          created_at?: string
          id?: string
          location?: unknown
          name?: string
          nearest_station?: string | null
          org_type?: string
          relay_credits?: number
          verified?: boolean
        }
        Relationships: []
      }
      partner_leads: {
        Row: {
          consent_scope: string
          consented_at: string
          id: string
          org_id: string
          partner_type: string
          status: string
        }
        Insert: {
          consent_scope: string
          consented_at?: string
          id?: string
          org_id: string
          partner_type: string
          status?: string
        }
        Update: {
          consent_scope?: string
          consented_at?: string
          id?: string
          org_id?: string
          partner_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      relay_credit_events: {
        Row: {
          created_at: string
          delta: number
          id: string
          match_id: string | null
          org_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          match_id?: string | null
          org_id: string
          reason: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          match_id?: string | null
          org_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "relay_credit_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relay_credit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offers: {
        Row: {
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          org_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          org_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_wants: {
        Row: {
          created_at: string
          description: string | null
          embedding: string | null
          id: string
          org_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          org_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          id?: string
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_wants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          completed_at: string | null
          completion_code: string | null
          created_at: string
          delivery_method: string | null
          id: string
          match_id: string
          scheduled_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          completion_code?: string | null
          created_at?: string
          delivery_method?: string | null
          id?: string
          match_id: string
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          completion_code?: string | null
          created_at?: string
          delivery_method?: string | null
          id?: string
          match_id?: string
          scheduled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_match: {
        Args: { p_match_id: string }
        Returns: {
          completed_at: string | null
          completion_code: string | null
          created_at: string
          delivery_method: string | null
          id: string
          match_id: string
          scheduled_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_embedding: {
        Args: { p_embedding: number[]; p_job_id: string }
        Returns: undefined
      }
      award_credits: {
        Args: {
          p_delta: number
          p_match_id?: string
          p_org_id: string
          p_reason: string
        }
        Returns: undefined
      }
      can_access_realtime_topic: { Args: { p_topic: string }; Returns: boolean }
      cancel_transfer: {
        Args: { p_reason?: string; p_transfer_id: string }
        Returns: {
          completed_at: string | null
          completion_code: string | null
          created_at: string
          delivery_method: string | null
          id: string
          match_id: string
          scheduled_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_embedding_jobs: {
        Args: { p_limit?: number }
        Returns: {
          content: string
          entity_id: string
          entity_type: string
          id: string
        }[]
      }
      complete_transfer: {
        Args: { p_completion_code?: string; p_transfer_id: string }
        Returns: {
          completed_at: string | null
          completion_code: string | null
          created_at: string
          delivery_method: string | null
          id: string
          match_id: string
          scheduled_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_match: {
        Args: { p_match_id: string }
        Returns: {
          accepted_at: string | null
          asset_score: number
          created_at: string
          distance_km: number | null
          donor_accepted_at: string | null
          donor_org_id: string
          geo_score: number
          id: string
          item_id: string
          need_id: string
          reason: string | null
          reason_generated_at: string | null
          recipient_accepted_at: string | null
          recipient_org_id: string
          service_note: string | null
          service_score: number
          status: string
          total_score: number
          trust_score: number
          urgency_score: number
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      embedding_queue_depth: { Args: never; Returns: number }
      expire_overdue_items: { Args: never; Returns: number }
      fail_embedding_job: {
        Args: { p_error: string; p_job_id: string }
        Returns: undefined
      }
      geo_point: { Args: { p_lat: number; p_lon: number }; Returns: unknown }
      has_accepted_match_with: {
        Args: { target_org: string }
        Returns: boolean
      }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      match_score_threshold: { Args: never; Returns: number }
      my_org_ids: { Args: never; Returns: string[] }
      org_dashboard: { Args: { p_org_id: string }; Returns: Json }
      process_embedding_jobs_fallback: {
        Args: { p_limit?: number }
        Returns: number
      }
      process_stale_embedding_jobs: {
        Args: { p_older_than?: string }
        Returns: number
      }
      recompute_matches: {
        Args: { p_item_id?: string; p_need_id?: string }
        Returns: number
      }
      score_pair: {
        Args: { p_item_id: string; p_need_id: string }
        Returns: {
          asset_score: number
          distance_km: number
          geo_score: number
          service_score: number
          total_score: number
          trust_score: number
          urgency_score: number
        }[]
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

