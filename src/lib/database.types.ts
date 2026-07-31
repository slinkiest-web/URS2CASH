export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      categories: {
        Row: {
          allowed_conditions: string[]
          browsable: boolean
          created_at: string
          id: string
          listable: boolean
          name: string
          photo_min: number
          slug: string
          sort_order: number
        }
        Insert: {
          allowed_conditions: string[]
          browsable?: boolean
          created_at?: string
          id?: string
          listable?: boolean
          name: string
          photo_min: number
          slug: string
          sort_order?: number
        }
        Update: {
          allowed_conditions?: string[]
          browsable?: boolean
          created_at?: string
          id?: string
          listable?: boolean
          name?: string
          photo_min?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_notes: string | null
          created_at: string
          detail: string
          evidence_urls: string[]
          id: string
          order_id: string
          raised_by: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          detail: string
          evidence_urls?: string[]
          id?: string
          order_id: string
          raised_by: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          detail?: string
          evidence_urls?: string[]
          id?: string
          order_id?: string
          raised_by?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders_participant_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          attribute_schema_version: number
          attributes: Json
          category_id: string
          condition: string
          condition_notes: string | null
          created_at: string
          description: string
          flaw_photo_indexes: number[]
          id: string
          photo_urls: string[]
          price_kobo: number
          published_at: string | null
          seller_id: string
          seller_listing_index: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attribute_schema_version: number
          attributes?: Json
          category_id: string
          condition: string
          condition_notes?: string | null
          created_at?: string
          description: string
          flaw_photo_indexes?: number[]
          id?: string
          photo_urls: string[]
          price_kobo: number
          published_at?: string | null
          seller_id: string
          seller_listing_index: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attribute_schema_version?: number
          attributes?: Json
          category_id?: string
          condition?: string
          condition_notes?: string | null
          created_at?: string
          description?: string
          flaw_photo_indexes?: number[]
          id?: string
          photo_urls?: string[]
          price_kobo?: number
          published_at?: string | null
          seller_id?: string
          seller_listing_index?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          matched_text: string | null
          pattern_type: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          matched_text?: string | null
          pattern_type?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          matched_text?: string | null
          pattern_type?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_transitions: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          from_status: string
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          from_status: string
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          from_status?: string
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_transitions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_transitions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_transitions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_participant_view"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }
        Insert: {
          amount_kobo: number
          auto_release_at?: string | null
          buyer_id: string
          commission_kobo: number
          created_at?: string
          delivered_at?: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at?: string | null
          id?: string
          listing_id: string
          paid_at?: string | null
          paystack_reference?: string | null
          rating_reminder_sent_at?: string | null
          refunded_at?: string | null
          released_at?: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at?: string | null
          status?: string
          tracking_note?: string | null
        }
        Update: {
          amount_kobo?: number
          auto_release_at?: string | null
          buyer_id?: string
          commission_kobo?: number
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string
          delivery_name?: string
          delivery_phone?: string
          delivery_state?: string
          disputed_at?: string | null
          id?: string
          listing_id?: string
          paid_at?: string | null
          paystack_reference?: string | null
          rating_reminder_sent_at?: string | null
          refunded_at?: string | null
          released_at?: string | null
          seller_id?: string
          seller_payout_kobo?: number
          shipped_at?: string | null
          status?: string
          tracking_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          is_verified: boolean
          profile_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          is_verified?: boolean
          profile_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_verified?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          admin_reference: string | null
          amount_kobo: number
          created_at: string
          failure_note: string | null
          id: string
          is_blocked: boolean
          order_id: string
          paid_at: string | null
          paid_by: string | null
          payout_account_id: string | null
          seller_id: string
          status: string
        }
        Insert: {
          admin_reference?: string | null
          amount_kobo: number
          created_at?: string
          failure_note?: string | null
          id?: string
          is_blocked?: boolean
          order_id: string
          paid_at?: string | null
          paid_by?: string | null
          payout_account_id?: string | null
          seller_id: string
          status?: string
        }
        Update: {
          admin_reference?: string | null
          amount_kobo?: number
          created_at?: string
          failure_note?: string | null
          id?: string
          is_blocked?: boolean
          order_id?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_account_id?: string | null
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders_participant_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          completed_sales_count: number
          created_at: string
          display_name: string
          dispute_upheld_count: number
          handle: string
          id: string
          is_suspended: boolean
          listing_limit_override: number | null
          phone: string | null
          rating_average: number | null
          rating_count: number
          state: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          completed_sales_count?: number
          created_at?: string
          display_name: string
          dispute_upheld_count?: number
          handle: string
          id: string
          is_suspended?: boolean
          listing_limit_override?: number | null
          phone?: string | null
          rating_average?: number | null
          rating_count?: number
          state?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          completed_sales_count?: number
          created_at?: string
          display_name?: string
          dispute_upheld_count?: number
          handle?: string
          id?: string
          is_suspended?: boolean
          listing_limit_override?: number | null
          phone?: string | null
          rating_average?: number | null
          rating_count?: number
          state?: string | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          id: string
          is_hidden: boolean
          order_id: string
          rater_id: string
          review: string | null
          score: number
          seller_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          order_id: string
          rater_id: string
          review?: string | null
          score: number
          seller_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_hidden?: boolean
          order_id?: string
          rater_id?: string
          review?: string | null
          score?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders_participant_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      orders_participant_view: {
        Row: {
          amount_kobo: number | null
          auto_release_at: string | null
          buyer_id: string | null
          commission_kobo: number | null
          created_at: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_name: string | null
          delivery_phone: string | null
          delivery_state: string | null
          disputed_at: string | null
          id: string | null
          listing_id: string | null
          paid_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string | null
          seller_payout_kobo: number | null
          shipped_at: string | null
          status: string | null
          tracking_note: string | null
        }
        Insert: {
          amount_kobo?: number | null
          auto_release_at?: string | null
          buyer_id?: string | null
          commission_kobo?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: never
          delivery_name?: never
          delivery_phone?: never
          delivery_state?: never
          disputed_at?: string | null
          id?: string | null
          listing_id?: string | null
          paid_at?: string | null
          refunded_at?: string | null
          released_at?: string | null
          seller_id?: string | null
          seller_payout_kobo?: number | null
          shipped_at?: string | null
          status?: string | null
          tracking_note?: string | null
        }
        Update: {
          amount_kobo?: number | null
          auto_release_at?: string | null
          buyer_id?: string | null
          commission_kobo?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address?: never
          delivery_name?: never
          delivery_phone?: never
          delivery_state?: never
          disputed_at?: string | null
          id?: string | null
          listing_id?: string | null
          paid_at?: string | null
          refunded_at?: string | null
          released_at?: string | null
          seller_id?: string | null
          seller_payout_kobo?: number | null
          shipped_at?: string | null
          status?: string | null
          tracking_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          completed_sales_count: number | null
          created_at: string | null
          display_name: string | null
          dispute_upheld_count: number | null
          handle: string | null
          id: string | null
          rating_average: number | null
          rating_count: number | null
          state: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          completed_sales_count?: number | null
          created_at?: string | null
          display_name?: string | null
          dispute_upheld_count?: number | null
          handle?: string | null
          id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          state?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          completed_sales_count?: number | null
          created_at?: string | null
          display_name?: string | null
          dispute_upheld_count?: number | null
          handle?: string | null
          id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          state?: string | null
        }
        Relationships: []
      }
      ratings_public: {
        Row: {
          created_at: string | null
          id: string | null
          is_hidden: boolean | null
          order_id: string | null
          rater_id: string | null
          review: string | null
          score: number | null
          seller_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          is_hidden?: boolean | null
          order_id?: string | null
          rater_id?: string | null
          review?: never
          score?: number | null
          seller_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          is_hidden?: boolean | null
          order_id?: string | null
          rater_id?: string | null
          review?: never
          score?: number | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders_participant_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_advance_shipped_to_delivered: {
        Args: { p_order_id: string }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_order_delivered: {
        Args: { p_buyer_id: string; p_order_id: string }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_pending_order: {
        Args: { p_order_id: string }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_unique_handle: { Args: { base: string }; Returns: string }
      mark_order_paid: {
        Args: { p_order_id: string }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_order_shipped: {
        Args: {
          p_auto_release_at: string
          p_order_id: string
          p_seller_id: string
          p_tracking_note: string
        }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      raise_dispute: {
        Args: {
          p_buyer_id: string
          p_detail: string
          p_evidence_urls: string[]
          p_order_id: string
          p_reason: string
          p_window_days: number
        }
        Returns: {
          admin_notes: string | null
          created_at: string
          detail: string
          evidence_urls: string[]
          id: string
          order_id: string
          raised_by: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      release_order: {
        Args: { p_actor_id?: string; p_actor_role: string; p_order_id: string }
        Returns: {
          amount_kobo: number
          auto_release_at: string | null
          buyer_id: string
          commission_kobo: number
          created_at: string
          delivered_at: string | null
          delivery_address: string
          delivery_name: string
          delivery_phone: string
          delivery_state: string
          disputed_at: string | null
          id: string
          listing_id: string
          paid_at: string | null
          paystack_reference: string | null
          rating_reminder_sent_at: string | null
          refunded_at: string | null
          released_at: string | null
          seller_id: string
          seller_payout_kobo: number
          shipped_at: string | null
          status: string
          tracking_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_listings: {
        Args: {
          result_limit?: number
          result_offset?: number
          search_query: string
        }
        Returns: {
          attribute_schema_version: number
          attributes: Json
          category_id: string
          condition: string
          condition_notes: string | null
          created_at: string
          description: string
          flaw_photo_indexes: number[]
          id: string
          photo_urls: string[]
          price_kobo: number
          published_at: string | null
          seller_id: string
          seller_listing_index: number
          status: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: false
          isSetofReturn: true
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

