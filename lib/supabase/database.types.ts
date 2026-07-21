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
      accommodation_documents: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          request_id: string
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          verified: boolean
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          request_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified?: boolean
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          request_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "accommodation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_requests: {
        Row: {
          animal_desc: string | null
          building_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          legal_note: string | null
          pet_id: string | null
          resident_id: string
          status: Database["public"]["Enums"]["accommodation_status"]
          type: Database["public"]["Enums"]["accommodation_type"]
          unit_id: string | null
        }
        Insert: {
          animal_desc?: string | null
          building_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          legal_note?: string | null
          pet_id?: string | null
          resident_id: string
          status?: Database["public"]["Enums"]["accommodation_status"]
          type: Database["public"]["Enums"]["accommodation_type"]
          unit_id?: string | null
        }
        Update: {
          animal_desc?: string | null
          building_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          legal_note?: string | null
          pet_id?: string | null
          resident_id?: string
          status?: Database["public"]["Enums"]["accommodation_status"]
          type?: Database["public"]["Enums"]["accommodation_type"]
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_requests_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "accommodation_requests_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_requests_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_requests_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "accommodation_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          building_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_hash: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          building_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          building_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          active: boolean
          apple_product_id: string | null
          audience: string
          billing_interval: string
          currency: string
          google_product_id: string | null
          id: string
          is_seat_based: boolean
          stripe_price_id: string | null
          unit_amount_cents: number
        }
        Insert: {
          active?: boolean
          apple_product_id?: string | null
          audience: string
          billing_interval: string
          currency?: string
          google_product_id?: string | null
          id: string
          is_seat_based?: boolean
          stripe_price_id?: string | null
          unit_amount_cents: number
        }
        Update: {
          active?: boolean
          apple_product_id?: string | null
          audience?: string
          billing_interval?: string
          currency?: string
          google_product_id?: string | null
          id?: string
          is_seat_based?: boolean
          stripe_price_id?: string | null
          unit_amount_cents?: number
        }
        Relationships: []
      }
      building_managers: {
        Row: {
          building_id: string
          created_at: string
          granted_by: string | null
          id: string
          is_primary: boolean
          profile_id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          is_primary?: boolean
          profile_id: string
        }
        Update: {
          building_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          is_primary?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_managers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_managers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_managers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "building_managers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_managers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      building_subscriptions: {
        Row: {
          building_id: string
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string | null
          seat_unit_amount_cents: number
          seats_in_use: number | null
          seats_purchased: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          seat_unit_amount_cents: number
          seats_in_use?: number | null
          seats_purchased?: number | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          seat_unit_amount_cents?: number
          seats_in_use?: number | null
          seats_purchased?: number | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_subscriptions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string | null
          building_code: string
          bylaw_enacted_on: string | null
          bylaw_version: number | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          pet_rules: Json
          postal_code: string | null
          region: string | null
          risk_score: number | null
          total_units: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          building_code: string
          bylaw_enacted_on?: string | null
          bylaw_version?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          pet_rules?: Json
          postal_code?: string | null
          region?: string | null
          risk_score?: number | null
          total_units?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          building_code?: string
          bylaw_enacted_on?: string | null
          bylaw_version?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          pet_rules?: Json
          postal_code?: string | null
          region?: string | null
          risk_score?: number | null
          total_units?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      business_listings: {
        Row: {
          active: boolean
          building_id: string | null
          business_id: string
          created_at: string
          ends_at: string | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          radius_m: number | null
          starts_at: string | null
        }
        Insert: {
          active?: boolean
          building_id?: string | null
          business_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          kind: string
          latitude?: number | null
          longitude?: number | null
          radius_m?: number | null
          starts_at?: string | null
        }
        Update: {
          active?: boolean
          building_id?: string | null
          business_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          radius_m?: number | null
          starts_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_listings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_listings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_reviews: {
        Row: {
          author_id: string
          author_name: string | null
          booking_id: string | null
          business_id: string
          comment: string | null
          created_at: string
          id: string
          owner_reply: string | null
          rating: number
          replied_at: string | null
        }
        Insert: {
          author_id: string
          author_name?: string | null
          booking_id?: string | null
          business_id: string
          comment?: string | null
          created_at?: string
          id?: string
          owner_reply?: string | null
          rating: number
          replied_at?: string | null
        }
        Update: {
          author_id?: string
          author_name?: string | null
          booking_id?: string | null
          business_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          owner_reply?: string | null
          rating?: number
          replied_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "service_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_services: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          currency: string
          description: string | null
          duration_min: number | null
          id: string
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          name: string
          price_cents?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          category: string
          created_at: string
          description: string | null
          hours: Json | null
          id: string
          is_open: boolean
          is_verified: boolean
          latitude: number | null
          listing_tier: Database["public"]["Enums"]["business_listing_tier"]
          logo_url: string | null
          longitude: number | null
          name: string
          owner_id: string
          price_range: string | null
          rating_avg: number
          rating_count: number
          service_radius_m: number | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          hours?: Json | null
          id?: string
          is_open?: boolean
          is_verified?: boolean
          latitude?: number | null
          listing_tier?: Database["public"]["Enums"]["business_listing_tier"]
          logo_url?: string | null
          longitude?: number | null
          name: string
          owner_id: string
          price_range?: string | null
          rating_avg?: number
          rating_count?: number
          service_radius_m?: number | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          hours?: Json | null
          id?: string
          is_open?: boolean
          is_verified?: boolean
          latitude?: number | null
          listing_tier?: Database["public"]["Enums"]["business_listing_tier"]
          logo_url?: string | null
          longitude?: number | null
          name?: string
          owner_id?: string
          price_range?: string | null
          rating_avg?: number
          rating_count?: number
          service_radius_m?: number | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      care_entries: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["care_entry_kind"]
          label: string | null
          logged_at: string
          logged_by: string | null
          note: string | null
          pet_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["care_entry_kind"]
          label?: string | null
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          pet_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["care_entry_kind"]
          label?: string | null
          logged_at?: string
          logged_by?: string | null
          note?: string | null
          pet_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_entries_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_entries_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "care_entries_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      care_targets: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["care_entry_kind"]
          pet_id: string
          target_amount: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["care_entry_kind"]
          pet_id: string
          target_amount?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["care_entry_kind"]
          pet_id?: string
          target_amount?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_targets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string | null
          building_id: string
          category: string
          comment_count: number
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          is_official: boolean
          is_pinned: boolean
          like_count: number
        }
        Insert: {
          author_id?: string | null
          building_id: string
          category?: string
          comment_count?: number
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_official?: boolean
          is_pinned?: boolean
          like_count?: number
        }
        Update: {
          author_id?: string | null
          building_id?: string
          category?: string
          comment_count?: number
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_official?: boolean
          is_pinned?: boolean
          like_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_posts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_access_tokens: {
        Row: {
          building_id: string
          created_at: string
          expires_at: string
          id: string
          issued_by: string | null
          revoked: boolean
          token: string
        }
        Insert: {
          building_id: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string | null
          revoked?: boolean
          token: string
        }
        Update: {
          building_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string | null
          revoked?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_access_tokens_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_access_tokens_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_access_tokens_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      events: {
        Row: {
          building_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          max_attendees: number | null
          starts_at: string | null
          title: string
        }
        Insert: {
          building_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          starts_at?: string | null
          title: string
        }
        Update: {
          building_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          starts_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      fines: {
        Row: {
          amount_cents: number
          building_id: string
          created_at: string
          currency: string
          due_on: string | null
          id: string
          issued_by: string | null
          resident_id: string | null
          status: Database["public"]["Enums"]["fine_status"]
          stripe_payment_intent_id: string | null
          unit_id: string | null
          updated_at: string
          violation_id: string | null
        }
        Insert: {
          amount_cents: number
          building_id: string
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          issued_by?: string | null
          resident_id?: string | null
          status?: Database["public"]["Enums"]["fine_status"]
          stripe_payment_intent_id?: string | null
          unit_id?: string | null
          updated_at?: string
          violation_id?: string | null
        }
        Update: {
          amount_cents?: number
          building_id?: string
          created_at?: string
          currency?: string
          due_on?: string | null
          id?: string
          issued_by?: string | null
          resident_id?: string | null
          status?: Database["public"]["Enums"]["fine_status"]
          stripe_payment_intent_id?: string | null
          unit_id?: string | null
          updated_at?: string
          violation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fines_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "fines_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "fines_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_violation_id_fkey"
            columns: ["violation_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          building_id: string
          created_at: string
          description: string
          evidence_paths: string[]
          id: string
          ip_hash: string | null
          is_anonymous: boolean
          location_text: string | null
          reference_code: string | null
          reporter_id: string | null
          status: Database["public"]["Enums"]["incident_status"]
          triaged_by: string | null
          type: Database["public"]["Enums"]["incident_type"]
          unit_id: string | null
          unit_involved: string | null
        }
        Insert: {
          building_id: string
          created_at?: string
          description: string
          evidence_paths?: string[]
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          location_text?: string | null
          reference_code?: string | null
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          triaged_by?: string | null
          type: Database["public"]["Enums"]["incident_type"]
          unit_id?: string | null
          unit_involved?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          location_text?: string | null
          reference_code?: string | null
          reporter_id?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          triaged_by?: string | null
          type?: Database["public"]["Enums"]["incident_type"]
          unit_id?: string | null
          unit_involved?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "incident_reports_triaged_by_fkey"
            columns: ["triaged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_triaged_by_fkey"
            columns: ["triaged_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "incident_reports_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found: {
        Row: {
          breed: string | null
          building_id: string | null
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          kind: string
          last_seen: string | null
          pet_name: string | null
          reporter_id: string | null
          reward_cents: number | null
          species: Database["public"]["Enums"]["pet_species"] | null
          status: string
        }
        Insert: {
          breed?: string | null
          building_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind: string
          last_seen?: string | null
          pet_name?: string | null
          reporter_id?: string | null
          reward_cents?: number | null
          species?: Database["public"]["Enums"]["pet_species"] | null
          status?: string
        }
        Update: {
          breed?: string | null
          building_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          last_seen?: string | null
          pet_name?: string | null
          reporter_id?: string | null
          reward_cents?: number | null
          species?: Database["public"]["Enums"]["pet_species"] | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_label: string | null
          action_target: string | null
          body: string | null
          building_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
          read_at: string | null
          severity: string
          title: string
        }
        Insert: {
          action_label?: string | null
          action_target?: string | null
          body?: string | null
          building_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          profile_id: string
          read_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          action_label?: string | null
          action_target?: string | null
          body?: string | null
          building_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          profile_id?: string
          read_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          profile_id: string | null
          provider: string
          provider_ref: string | null
          purpose: string
          related_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          profile_id?: string | null
          provider: string
          provider_ref?: string | null
          purpose: string
          related_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          profile_id?: string | null
          provider?: string
          provider_ref?: string | null
          purpose?: string
          related_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      payout_items: {
        Row: {
          amount_cents: number
          fine_id: string | null
          payment_id: string
          payout_id: string
        }
        Insert: {
          amount_cents: number
          fine_id?: string | null
          payment_id: string
          payout_id: string
        }
        Update: {
          amount_cents?: number
          fine_id?: string | null
          payment_id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_fine_id_fkey"
            columns: ["fine_id"]
            isOneToOne: false
            referencedRelation: "fines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          building_id: string
          connect_account_id: string | null
          created_at: string
          currency: string
          id: string
          period_end: string | null
          period_start: string | null
          platform_fee_cents: number
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          building_id: string
          connect_account_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          platform_fee_cents?: number
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          building_id?: string
          connect_account_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          platform_fee_cents?: number
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_activity: {
        Row: {
          created_at: string
          id: string
          pet_id: string
          text: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          pet_id: string
          text: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          pet_id?: string
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_activity_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_log: {
        Row: {
          completed: boolean
          completed_at: string
          id: string
          on_date: string
          task_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string
          id?: string
          on_date?: string
          task_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string
          id?: string
          on_date?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pet_care_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_care_tasks: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: Database["public"]["Enums"]["care_kind"]
          label: string
          pet_id: string
          sort_order: number | null
          time_label: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["care_kind"]
          label: string
          pet_id: string
          sort_order?: number | null
          time_label?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["care_kind"]
          label?: string
          pet_id?: string
          sort_order?: number | null
          time_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_tasks_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_documents: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          name: string | null
          pet_id: string | null
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          name?: string | null
          pet_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          name?: string | null
          pet_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_documents_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      pet_emergency_contacts: {
        Row: {
          id: string
          name: string
          pet_id: string
          phone: string
          role: string
          sort_order: number | null
        }
        Insert: {
          id?: string
          name: string
          pet_id: string
          phone: string
          role: string
          sort_order?: number | null
        }
        Update: {
          id?: string
          name?: string
          pet_id?: string
          phone?: string
          role?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_emergency_contacts_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_feeding: {
        Row: {
          food: string | null
          id: string
          name: string
          pet_id: string
          portion: string | null
          sort_order: number | null
          time_label: string | null
        }
        Insert: {
          food?: string | null
          id?: string
          name: string
          pet_id: string
          portion?: string | null
          sort_order?: number | null
          time_label?: string | null
        }
        Update: {
          food?: string | null
          id?: string
          name?: string
          pet_id?: string
          portion?: string | null
          sort_order?: number | null
          time_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_feeding_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_medications: {
        Row: {
          created_at: string
          dosage: string | null
          frequency: string | null
          id: string
          name: string
          next_due: string | null
          pet_id: string
          reminder: boolean
        }
        Insert: {
          created_at?: string
          dosage?: string | null
          frequency?: string | null
          id?: string
          name: string
          next_due?: string | null
          pet_id: string
          reminder?: boolean
        }
        Update: {
          created_at?: string
          dosage?: string | null
          frequency?: string | null
          id?: string
          name?: string
          next_due?: string | null
          pet_id?: string
          reminder?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pet_medications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_vaccinations: {
        Row: {
          created_at: string
          doc_id: string | null
          expires_on: string | null
          given_on: string | null
          id: string
          name: string
          pet_id: string
          status: Database["public"]["Enums"]["doc_status"]
        }
        Insert: {
          created_at?: string
          doc_id?: string | null
          expires_on?: string | null
          given_on?: string | null
          id?: string
          name: string
          pet_id: string
          status?: Database["public"]["Enums"]["doc_status"]
        }
        Update: {
          created_at?: string
          doc_id?: string | null
          expires_on?: string | null
          given_on?: string | null
          id?: string
          name?: string
          pet_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pet_vaccinations_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "pet_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_vaccinations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          allergies: string | null
          behavioral_notes: string | null
          breed: string | null
          building_id: string | null
          color: string | null
          compliance_pct: number | null
          conditions: string | null
          created_at: string
          deleted_at: string | null
          dob: string | null
          grandfathered_on: string | null
          id: string
          image_url: string | null
          is_grandfathered: boolean | null
          medications_notes: string | null
          microchip: string | null
          name: string
          neutered: boolean | null
          owner_id: string
          registration_status: Database["public"]["Enums"]["registration_status"]
          sex: Database["public"]["Enums"]["pet_sex"] | null
          species: Database["public"]["Enums"]["pet_species"]
          status: Database["public"]["Enums"]["pet_status"]
          unit_id: string | null
          updated_at: string
          vet_clinic: string | null
          vet_name: string | null
          vet_phone: string | null
          weight_grams: number | null
        }
        Insert: {
          allergies?: string | null
          behavioral_notes?: string | null
          breed?: string | null
          building_id?: string | null
          color?: string | null
          compliance_pct?: number | null
          conditions?: string | null
          created_at?: string
          deleted_at?: string | null
          dob?: string | null
          grandfathered_on?: string | null
          id?: string
          image_url?: string | null
          is_grandfathered?: boolean | null
          medications_notes?: string | null
          microchip?: string | null
          name: string
          neutered?: boolean | null
          owner_id: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          species: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["pet_status"]
          unit_id?: string | null
          updated_at?: string
          vet_clinic?: string | null
          vet_name?: string | null
          vet_phone?: string | null
          weight_grams?: number | null
        }
        Update: {
          allergies?: string | null
          behavioral_notes?: string | null
          breed?: string | null
          building_id?: string | null
          color?: string | null
          compliance_pct?: number | null
          conditions?: string | null
          created_at?: string
          deleted_at?: string | null
          dob?: string | null
          grandfathered_on?: string | null
          id?: string
          image_url?: string | null
          is_grandfathered?: boolean | null
          medications_notes?: string | null
          microchip?: string | null
          name?: string
          neutered?: boolean | null
          owner_id?: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          species?: Database["public"]["Enums"]["pet_species"]
          status?: Database["public"]["Enums"]["pet_status"]
          unit_id?: string | null
          updated_at?: string
          vet_clinic?: string | null
          vet_name?: string | null
          vet_phone?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_super_admin: boolean
          is_suspended: boolean
          latitude: number | null
          locale: string | null
          location_label: string | null
          location_source: string | null
          longitude: number | null
          member_since: string | null
          onboarded: boolean
          phone: string | null
          plan_label: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string | null
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_super_admin?: boolean
          is_suspended?: boolean
          latitude?: number | null
          locale?: string | null
          location_label?: string | null
          location_source?: string | null
          longitude?: number | null
          member_since?: string | null
          onboarded?: boolean
          phone?: string | null
          plan_label?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
          is_suspended?: boolean
          latitude?: number | null
          locale?: string | null
          location_label?: string | null
          location_source?: string | null
          longitude?: number | null
          member_since?: string | null
          onboarded?: boolean
          phone?: string | null
          plan_label?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          expo_token: string | null
          id: string
          last_seen_at: string
          platform: string | null
          profile_id: string
        }
        Insert: {
          expo_token?: string | null
          id?: string
          last_seen_at?: string
          platform?: string | null
          profile_id: string
        }
        Update: {
          expo_token?: string | null
          id?: string
          last_seen_at?: string
          platform?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      resident_links: {
        Row: {
          access_notes: string | null
          building_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          left_at: string | null
          move_in_date: string | null
          profile_id: string
          requested_at: string
          status: Database["public"]["Enums"]["resident_link_status"]
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          building_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          left_at?: string | null
          move_in_date?: string | null
          profile_id: string
          requested_at?: string
          status?: Database["public"]["Enums"]["resident_link_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          building_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          left_at?: string | null
          move_in_date?: string | null
          profile_id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["resident_link_status"]
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_links_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_links_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_links_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "resident_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "resident_links_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bookings: {
        Row: {
          amount_cents: number
          business_id: string
          commission_cents: number
          created_at: string
          customer_id: string
          customer_note: string | null
          declined_reason: string | null
          id: string
          payment_id: string | null
          pet_id: string | null
          responded_at: string | null
          scheduled_for: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          business_id: string
          commission_cents?: number
          created_at?: string
          customer_id: string
          customer_note?: string | null
          declined_reason?: string | null
          id?: string
          payment_id?: string | null
          pet_id?: string | null
          responded_at?: string | null
          scheduled_for?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          commission_cents?: number
          created_at?: string
          customer_id?: string
          customer_note?: string | null
          declined_reason?: string | null
          id?: string
          payment_id?: string | null
          pet_id?: string | null
          responded_at?: string | null
          scheduled_for?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "service_bookings_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "business_services"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_seats: {
        Row: {
          activated_at: string
          active: boolean
          building_subscription_id: string
          deactivated_at: string | null
          id: string
          profile_id: string
          resident_link_id: string
        }
        Insert: {
          activated_at?: string
          active?: boolean
          building_subscription_id: string
          deactivated_at?: string | null
          id?: string
          profile_id: string
          resident_link_id: string
        }
        Update: {
          activated_at?: string
          active?: boolean
          building_subscription_id?: string
          deactivated_at?: string | null
          id?: string
          profile_id?: string
          resident_link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_seats_building_subscription_id_fkey"
            columns: ["building_subscription_id"]
            isOneToOne: false
            referencedRelation: "building_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_seats_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_seats_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sponsored_seats_resident_link_id_fkey"
            columns: ["resident_link_id"]
            isOneToOne: false
            referencedRelation: "resident_links"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string | null
          profile_id: string
          provider_ref: string | null
          source: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          profile_id: string
          provider_ref?: string | null
          source: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string | null
          profile_id?: string
          provider_ref?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      units: {
        Row: {
          building_id: string
          created_at: string
          floor: number | null
          id: string
          unit_number: string
        }
        Insert: {
          building_id: string
          created_at?: string
          floor?: number | null
          id?: string
          unit_number: string
        }
        Update: {
          building_id?: string
          created_at?: string
          floor?: number | null
          id?: string
          unit_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      violation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["violation_stage"] | null
          id: string
          note: string | null
          occurred_on: string | null
          to_stage: Database["public"]["Enums"]["violation_stage"]
          violation_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["violation_stage"] | null
          id?: string
          note?: string | null
          occurred_on?: string | null
          to_stage: Database["public"]["Enums"]["violation_stage"]
          violation_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["violation_stage"] | null
          id?: string
          note?: string | null
          occurred_on?: string | null
          to_stage?: Database["public"]["Enums"]["violation_stage"]
          violation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "violation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violation_events_violation_id_fkey"
            columns: ["violation_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
        ]
      }
      violations: {
        Row: {
          building_id: string
          created_at: string
          id: string
          opened_by: string | null
          origin_incident_id: string | null
          pet_id: string | null
          resident_id: string | null
          resolution_outcome: string | null
          resolved_at: string | null
          stage: Database["public"]["Enums"]["violation_stage"]
          type: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          opened_by?: string | null
          origin_incident_id?: string | null
          pet_id?: string | null
          resident_id?: string | null
          resolution_outcome?: string | null
          resolved_at?: string | null
          stage?: Database["public"]["Enums"]["violation_stage"]
          type: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          opened_by?: string | null
          origin_incident_id?: string | null
          pet_id?: string | null
          resident_id?: string | null
          resolution_outcome?: string | null
          resolved_at?: string | null
          stage?: Database["public"]["Enums"]["violation_stage"]
          type?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "violations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violations_origin_incident_id_fkey"
            columns: ["origin_incident_id"]
            isOneToOne: false
            referencedRelation: "incident_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violations_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      user_entitlements: {
        Row: {
          is_premium: boolean | null
          profile_id: string | null
          source: Database["public"]["Enums"]["entitlement_source"] | null
        }
        Insert: {
          is_premium?: never
          profile_id?: string | null
          source?: never
        }
        Update: {
          is_premium?: never
          profile_id?: string | null
          source?: never
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      business_mark_booking_paid: {
        Args: { p_booking: string }
        Returns: string
      }
      emergency_directory: { Args: { p_token: string }; Returns: Json }
      escalate_incident_to_violation: {
        Args: { p_incident: string; p_type?: string }
        Returns: Json
      }
      has_booking_for_pet: { Args: { p: string }; Returns: boolean }
      has_booking_with: { Args: { p: string }; Returns: boolean }
      incident_status_by_reference: { Args: { p_ref: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_premium: { Args: { p_user: string }; Returns: boolean }
      is_primary_manager: { Args: { b: string }; Returns: boolean }
      is_resident_of: { Args: { b: string }; Returns: boolean }
      leave_my_building_link: { Args: never; Returns: undefined }
      manager_decide_registration: {
        Args: { p_approve: boolean; p_pet: string }
        Returns: undefined
      }
      manages_building: { Args: { b: string }; Returns: boolean }
      my_building_link: { Args: never; Returns: Json }
      request_building_link: { Args: { p_code: string }; Returns: Json }
      resolve_building_code: { Args: { p_code: string }; Returns: Json }
      resolve_entitlement: {
        Args: { p_user: string }
        Returns: Database["public"]["Enums"]["entitlement_source"]
      }
      shares_managed_building_with: { Args: { p: string }; Returns: boolean }
      submit_incident_report: {
        Args: {
          p_anonymous?: boolean
          p_building_code: string
          p_description: string
          p_location?: string
          p_type: string
          p_unit?: string
        }
        Returns: Json
      }
      targetable_buildings: {
        Args: never
        Returns: {
          cats: number
          city: string
          dogs: number
          id: string
          name: string
          pet_owners: number
        }[]
      }
    }
    Enums: {
      accommodation_status: "pending" | "approved" | "denied" | "info_requested"
      accommodation_type: "esa" | "service_animal"
      booking_status:
        | "requested"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "paid"
        | "declined"
        | "cancelled"
      business_listing_tier: "basic" | "featured" | "premium"
      care_entry_kind:
        | "food"
        | "medicine"
        | "treat"
        | "water"
        | "walk"
        | "weight"
        | "potty"
        | "other"
      care_kind: "meal" | "medication" | "water" | "walk" | "grooming" | "other"
      doc_kind:
        | "vaccination"
        | "municipal_license"
        | "liability_insurance"
        | "building_registration"
        | "microchip_registration"
        | "esa_letter"
        | "provider_license"
        | "other"
      doc_status:
        | "current"
        | "expiring"
        | "expired"
        | "missing"
        | "rejected"
        | "approved"
        | "active"
      entitlement_source:
        | "individual_stripe"
        | "individual_iap"
        | "building_sponsored"
        | "complimentary"
      fine_status:
        | "issued"
        | "paid"
        | "partially_paid"
        | "waived"
        | "disputed"
        | "remitted"
        | "written_off"
      incident_status:
        | "submitted"
        | "triaged"
        | "investigating"
        | "linked_to_violation"
        | "dismissed"
        | "resolved"
      incident_type:
        | "noise"
        | "aggressive"
        | "off_leash"
        | "waste"
        | "damage"
        | "unregistered"
        | "other"
      notification_kind:
        | "compliance"
        | "incident"
        | "building"
        | "billing"
        | "community"
        | "system"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      payout_status: "pending" | "in_transit" | "paid" | "failed" | "reversed"
      pet_sex: "male" | "female" | "unknown"
      pet_species:
        | "dog"
        | "cat"
        | "bird"
        | "small_mammal"
        | "fish"
        | "reptile"
        | "other"
      pet_status: "home" | "away" | "at_vet" | "vacation" | "deceased"
      registration_status:
        | "draft"
        | "pending"
        | "approved"
        | "denied"
        | "info_requested"
        | "revoked"
      resident_link_status:
        | "pending"
        | "approved"
        | "denied"
        | "revoked"
        | "left"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "paused"
      user_role: "pet_owner" | "building_manager" | "super_admin" | "business"
      violation_stage:
        | "investigation"
        | "pending_review"
        | "verbal_warning"
        | "written_warning"
        | "fine_issued"
        | "resolved"
        | "dismissed"
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
    Enums: {
      accommodation_status: ["pending", "approved", "denied", "info_requested"],
      accommodation_type: ["esa", "service_animal"],
      booking_status: [
        "requested",
        "confirmed",
        "in_progress",
        "completed",
        "paid",
        "declined",
        "cancelled",
      ],
      business_listing_tier: ["basic", "featured", "premium"],
      care_entry_kind: [
        "food",
        "medicine",
        "treat",
        "water",
        "walk",
        "weight",
        "potty",
        "other",
      ],
      care_kind: ["meal", "medication", "water", "walk", "grooming", "other"],
      doc_kind: [
        "vaccination",
        "municipal_license",
        "liability_insurance",
        "building_registration",
        "microchip_registration",
        "esa_letter",
        "provider_license",
        "other",
      ],
      doc_status: [
        "current",
        "expiring",
        "expired",
        "missing",
        "rejected",
        "approved",
        "active",
      ],
      entitlement_source: [
        "individual_stripe",
        "individual_iap",
        "building_sponsored",
        "complimentary",
      ],
      fine_status: [
        "issued",
        "paid",
        "partially_paid",
        "waived",
        "disputed",
        "remitted",
        "written_off",
      ],
      incident_status: [
        "submitted",
        "triaged",
        "investigating",
        "linked_to_violation",
        "dismissed",
        "resolved",
      ],
      incident_type: [
        "noise",
        "aggressive",
        "off_leash",
        "waste",
        "damage",
        "unregistered",
        "other",
      ],
      notification_kind: [
        "compliance",
        "incident",
        "building",
        "billing",
        "community",
        "system",
      ],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      payout_status: ["pending", "in_transit", "paid", "failed", "reversed"],
      pet_sex: ["male", "female", "unknown"],
      pet_species: [
        "dog",
        "cat",
        "bird",
        "small_mammal",
        "fish",
        "reptile",
        "other",
      ],
      pet_status: ["home", "away", "at_vet", "vacation", "deceased"],
      registration_status: [
        "draft",
        "pending",
        "approved",
        "denied",
        "info_requested",
        "revoked",
      ],
      resident_link_status: [
        "pending",
        "approved",
        "denied",
        "revoked",
        "left",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "paused",
      ],
      user_role: ["pet_owner", "building_manager", "super_admin", "business"],
      violation_stage: [
        "investigation",
        "pending_review",
        "verbal_warning",
        "written_warning",
        "fine_issued",
        "resolved",
        "dismissed",
      ],
    },
  },
} as const
