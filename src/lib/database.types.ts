/**
 * Generated Supabase database types.
 *
 * ⚠️ PROVISIONAL — HAND-AUTHORED, NOT CLI-GENERATED.
 *
 * HARD RULE (PRD §12.1): this file must be produced by running
 *   npx supabase gen types typescript --local > src/lib/database.types.ts
 * after every migration, and committed in the same commit as the migration.
 *
 * That command requires a running local Supabase stack (Docker), which is
 * not available in the environment this file was authored in — Docker itself
 * is not installed, so `supabase start` / `supabase db reset` cannot run.
 *
 * This file was written by hand to mirror the shape
 * `supabase gen types typescript` would produce for migrations
 * 20260727202617_profiles.sql, 20260727215742_categories_listings.sql, and
 * 20260728100239_orders_and_related.sql, so the app can typecheck against
 * real column names in the meantime. Regenerate it for real as soon as
 * Docker is available locally, and delete this notice once the CLI output
 * replaces it.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          handle: string;
          avatar_url: string | null;
          bio: string | null;
          phone: string | null;
          state: string | null;
          is_suspended: boolean;
          completed_sales_count: number;
          rating_average: number | null;
          rating_count: number;
          dispute_upheld_count: number;
          listing_limit_override: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          handle: string;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          state?: string | null;
          is_suspended?: boolean;
          completed_sales_count?: number;
          rating_average?: number | null;
          rating_count?: number;
          dispute_upheld_count?: number;
          listing_limit_override?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          handle?: string;
          avatar_url?: string | null;
          bio?: string | null;
          phone?: string | null;
          state?: string | null;
          is_suspended?: boolean;
          completed_sales_count?: number;
          rating_average?: number | null;
          rating_count?: number;
          dispute_upheld_count?: number;
          listing_limit_override?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_accounts: {
        Row: {
          id: string;
          profile_id: string;
          bank_code: string;
          bank_name: string;
          account_number: string;
          account_name: string;
          is_verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          bank_code: string;
          bank_name: string;
          account_number: string;
          account_name: string;
          is_verified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          bank_code?: string;
          bank_name?: string;
          account_number?: string;
          account_name?: string;
          is_verified?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payout_accounts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          listable: boolean;
          browsable: boolean;
          photo_min: number;
          allowed_conditions: string[];
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          listable?: boolean;
          browsable?: boolean;
          photo_min: number;
          allowed_conditions: string[];
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          listable?: boolean;
          browsable?: boolean;
          photo_min?: number;
          allowed_conditions?: string[];
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          seller_id: string;
          category_id: string;
          title: string;
          description: string;
          price_kobo: number;
          condition: string;
          condition_notes: string | null;
          status: string;
          attributes: Json;
          attribute_schema_version: number;
          photo_urls: string[];
          flaw_photo_indexes: number[];
          seller_listing_index: number;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          category_id: string;
          title: string;
          description: string;
          price_kobo: number;
          condition: string;
          condition_notes?: string | null;
          status?: string;
          attributes?: Json;
          attribute_schema_version: number;
          photo_urls: string[];
          flaw_photo_indexes?: number[];
          // NOT NULL with no column default — the assign_seller_listing_index
          // trigger always overwrites this before the row is written.
          seller_listing_index?: number;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_id?: string;
          category_id?: string;
          title?: string;
          description?: string;
          price_kobo?: number;
          condition?: string;
          condition_notes?: string | null;
          status?: string;
          attributes?: Json;
          attribute_schema_version?: number;
          photo_urls?: string[];
          flaw_photo_indexes?: number[];
          seller_listing_index?: number;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          status: string;
          amount_kobo: number;
          commission_kobo: number;
          seller_payout_kobo: number;
          paystack_reference: string | null;
          delivery_name: string;
          delivery_state: string;
          delivery_address: string;
          delivery_phone: string;
          tracking_note: string | null;
          paid_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          released_at: string | null;
          disputed_at: string | null;
          refunded_at: string | null;
          auto_release_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          status?: string;
          amount_kobo: number;
          commission_kobo: number;
          seller_payout_kobo: number;
          paystack_reference?: string | null;
          delivery_name: string;
          delivery_state: string;
          delivery_address: string;
          delivery_phone: string;
          tracking_note?: string | null;
          paid_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          released_at?: string | null;
          disputed_at?: string | null;
          refunded_at?: string | null;
          auto_release_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          buyer_id?: string;
          seller_id?: string;
          status?: string;
          amount_kobo?: number;
          commission_kobo?: number;
          seller_payout_kobo?: number;
          paystack_reference?: string | null;
          delivery_name?: string;
          delivery_state?: string;
          delivery_address?: string;
          delivery_phone?: string;
          tracking_note?: string | null;
          paid_at?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          released_at?: string | null;
          disputed_at?: string | null;
          refunded_at?: string | null;
          auto_release_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: true;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      disputes: {
        Row: {
          id: string;
          order_id: string;
          raised_by: string;
          reason: string;
          detail: string;
          evidence_urls: string[];
          status: string;
          admin_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          raised_by: string;
          reason: string;
          detail: string;
          evidence_urls?: string[];
          status?: string;
          admin_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          raised_by?: string;
          reason?: string;
          detail?: string;
          evidence_urls?: string[];
          status?: string;
          admin_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_raised_by_fkey";
            columns: ["raised_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ratings: {
        Row: {
          id: string;
          order_id: string;
          rater_id: string;
          seller_id: string;
          score: number;
          review: string | null;
          is_hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          rater_id: string;
          seller_id: string;
          score: number;
          review?: string | null;
          is_hidden?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          rater_id?: string;
          seller_id?: string;
          score?: number;
          review?: string | null;
          is_hidden?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ratings_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      payouts: {
        Row: {
          id: string;
          order_id: string;
          seller_id: string;
          payout_account_id: string;
          amount_kobo: number;
          status: string;
          admin_reference: string | null;
          paid_by: string | null;
          paid_at: string | null;
          failure_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          seller_id: string;
          payout_account_id: string;
          amount_kobo: number;
          status?: string;
          admin_reference?: string | null;
          paid_by?: string | null;
          paid_at?: string | null;
          failure_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          seller_id?: string;
          payout_account_id?: string;
          amount_kobo?: number;
          status?: string;
          admin_reference?: string | null;
          paid_by?: string | null;
          paid_at?: string | null;
          failure_note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payouts_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_payout_account_id_fkey";
            columns: ["payout_account_id"];
            isOneToOne: false;
            referencedRelation: "payout_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_flags: {
        Row: {
          id: string;
          listing_id: string;
          source: string;
          reason: string;
          pattern_type: string | null;
          matched_text: string | null;
          status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          source: string;
          reason: string;
          pattern_type?: string | null;
          matched_text?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          source?: string;
          reason?: string;
          pattern_type?: string | null;
          matched_text?: string | null;
          status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_flags_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          event_id: string;
          event_type: string;
          payload: Json;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          event_id?: string;
          event_type?: string;
          payload?: Json;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      profiles_public: {
        Row: {
          id: string;
          display_name: string;
          handle: string;
          avatar_url: string | null;
          bio: string | null;
          state: string | null;
          completed_sales_count: number;
          rating_average: number | null;
          rating_count: number;
          created_at: string;
        };
        Relationships: [];
      };
      ratings_public: {
        Row: {
          id: string;
          order_id: string;
          rater_id: string;
          seller_id: string;
          score: number;
          review: string | null;
          is_hidden: boolean;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      generate_unique_handle: {
        Args: { base: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
