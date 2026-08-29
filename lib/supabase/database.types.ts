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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      accommodation_documents: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label: string | null
          mime_type: string | null
          purged_at: string | null
          request_id: string
          review_note: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          uploaded_at: string
          uploaded_by: string | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          label?: string | null
          mime_type?: string | null
          purged_at?: string | null
          request_id: string
          review_note?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          label?: string | null
          mime_type?: string | null
          purged_at?: string | null
          request_id?: string
          review_note?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "accommodation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "accommodation_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
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
          decision_note: string | null
          id: string
          legal_note: string | null
          pet_id: string | null
          resident_id: string
          status: Database["public"]["Enums"]["accommodation_status"]
          submitted_at: string | null
          type: Database["public"]["Enums"]["accommodation_type"]
          unit_id: string | null
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          animal_desc?: string | null
          building_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          legal_note?: string | null
          pet_id?: string | null
          resident_id: string
          status?: Database["public"]["Enums"]["accommodation_status"]
          submitted_at?: string | null
          type: Database["public"]["Enums"]["accommodation_type"]
          unit_id?: string | null
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          animal_desc?: string | null
          building_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          legal_note?: string | null
          pet_id?: string | null
          resident_id?: string
          status?: Database["public"]["Enums"]["accommodation_status"]
          submitted_at?: string | null
          type?: Database["public"]["Enums"]["accommodation_type"]
          unit_id?: string | null
          updated_at?: string
          withdrawn_at?: string | null
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
      ai_conversations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          pet_id: string | null
          profile_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          pet_id?: string | null
          profile_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          pet_id?: string | null
          profile_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          image_paths: string[]
          model: string | null
          role: string
          tokens_in: number | null
          tokens_out: number | null
          triage_level: string | null
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          image_paths?: string[]
          model?: string | null
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
          triage_level?: string | null
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          image_paths?: string[]
          model?: string | null
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
          triage_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_suggestions: {
        Row: {
          action_label: string | null
          action_target: string | null
          body: string | null
          created_at: string
          dedupe_key: string
          evidence: Json | null
          id: string
          kind: string
          pet_id: string
          profile_id: string
          severity: string
          status: string
          title: string
          valid_until: string | null
        }
        Insert: {
          action_label?: string | null
          action_target?: string | null
          body?: string | null
          created_at?: string
          dedupe_key: string
          evidence?: Json | null
          id?: string
          kind: string
          pet_id: string
          profile_id: string
          severity?: string
          status?: string
          title: string
          valid_until?: string | null
        }
        Update: {
          action_label?: string | null
          action_target?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string
          evidence?: Json | null
          id?: string
          kind?: string
          pet_id?: string
          profile_id?: string
          severity?: string
          status?: string
          title?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_suggestions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      appointment_types: {
        Row: {
          business_id: string
          colour: string
          created_at: string
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          is_online_bookable: boolean
          name: string
          price_cents: number
          requires_confirmation: boolean
          sort_order: number
          species: Database["public"]["Enums"]["pet_species"][]
          updated_at: string
        }
        Insert: {
          business_id: string
          colour?: string
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_online_bookable?: boolean
          name: string
          price_cents?: number
          requires_confirmation?: boolean
          sort_order?: number
          species?: Database["public"]["Enums"]["pet_species"][]
          updated_at?: string
        }
        Update: {
          business_id?: string
          colour?: string
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_online_bookable?: boolean
          name?: string
          price_cents?: number
          requires_confirmation?: boolean
          sort_order?: number
          species?: Database["public"]["Enums"]["pet_species"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_types_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          arrived_at: string | null
          booked_by: string | null
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          ends_at: string
          id: string
          location_id: string | null
          note: string | null
          patient_id: string | null
          ready_at: string | null
          reason: string | null
          resource_id: string | null
          source: string
          staff_id: string | null
          started_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          type_id: string | null
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          booked_by?: string | null
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          ends_at: string
          id?: string
          location_id?: string | null
          note?: string | null
          patient_id?: string | null
          ready_at?: string | null
          reason?: string | null
          resource_id?: string | null
          source?: string
          staff_id?: string | null
          started_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type_id?: string | null
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          booked_by?: string | null
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          ends_at?: string
          id?: string
          location_id?: string | null
          note?: string | null
          patient_id?: string | null
          ready_at?: string | null
          reason?: string | null
          resource_id?: string | null
          source?: string
          staff_id?: string | null
          started_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "clinic_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
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
      building_rules: {
        Row: {
          body: string
          building_id: string
          category: Database["public"]["Enums"]["building_rule_category"]
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          building_id: string
          category: Database["public"]["Enums"]["building_rule_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          building_id?: string
          category?: Database["public"]["Enums"]["building_rule_category"]
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_rules_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "building_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_rules_updated_by_fkey"
            columns: ["updated_by"]
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
      business_locations: {
        Row: {
          address: string | null
          after_hours_note: string | null
          business_id: string
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          hours: Json
          id: string
          is_active: boolean
          is_primary: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          after_hours_note?: string | null
          business_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          hours?: Json
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          after_hours_note?: string | null
          business_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          hours?: Json
          id?: string
          is_active?: boolean
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_locations_business_id_fkey"
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
      business_staff: {
        Row: {
          business_id: string
          colour: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          is_bookable: boolean
          joined_at: string | null
          licence_expires_on: string | null
          licence_number: string | null
          location_id: string | null
          profile_id: string
          role: Database["public"]["Enums"]["clinic_staff_role"]
          title: string | null
        }
        Insert: {
          business_id: string
          colour?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          is_bookable?: boolean
          joined_at?: string | null
          licence_expires_on?: string | null
          licence_number?: string | null
          location_id?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["clinic_staff_role"]
          title?: string | null
        }
        Update: {
          business_id?: string
          colour?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          is_bookable?: boolean
          joined_at?: string | null
          licence_expires_on?: string | null
          licence_number?: string | null
          location_id?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["clinic_staff_role"]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_staff_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_staff_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_staff_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_types: {
        Row: {
          client_label: string
          code: string
          created_at: string
          description: string | null
          icon: string | null
          is_active: boolean
          label: string
          may_request_records: boolean
          modules: string[]
          plural_label: string | null
          sort_order: number
          subject_label: string
          subject_plural: string
          updated_at: string
        }
        Insert: {
          client_label?: string
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          is_active?: boolean
          label: string
          may_request_records?: boolean
          modules?: string[]
          plural_label?: string | null
          sort_order?: number
          subject_label?: string
          subject_plural?: string
          updated_at?: string
        }
        Update: {
          client_label?: string
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          is_active?: boolean
          label?: string
          may_request_records?: boolean
          modules?: string[]
          plural_label?: string | null
          sort_order?: number
          subject_label?: string
          subject_plural?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_verifications: {
        Row: {
          business_id: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          document_path: string | null
          expires_on: string | null
          id: string
          issuing_body: string | null
          kind: string
          licence_number: string | null
          note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          document_path?: string | null
          expires_on?: string | null
          id?: string
          issuing_body?: string | null
          kind: string
          licence_number?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          document_path?: string | null
          expires_on?: string | null
          id?: string
          issuing_body?: string | null
          kind?: string
          licence_number?: string | null
          note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_verifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          booking_mode: string
          business_kind: string
          category: string
          city: string | null
          country: string | null
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
          postal_code: string | null
          price_range: string | null
          rating_avg: number
          rating_count: number
          region: string | null
          service_radius_m: number | null
          tags: string[]
          tier: Database["public"]["Enums"]["business_tier"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_mode?: string
          business_kind?: string
          category: string
          city?: string | null
          country?: string | null
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
          postal_code?: string | null
          price_range?: string | null
          rating_avg?: number
          rating_count?: number
          region?: string | null
          service_radius_m?: number | null
          tags?: string[]
          tier?: Database["public"]["Enums"]["business_tier"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_mode?: string
          business_kind?: string
          category?: string
          city?: string | null
          country?: string | null
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
          postal_code?: string | null
          price_range?: string | null
          rating_avg?: number
          rating_count?: number
          region?: string | null
          service_radius_m?: number | null
          tags?: string[]
          tier?: Database["public"]["Enums"]["business_tier"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_kind_fk"
            columns: ["business_kind"]
            isOneToOne: false
            referencedRelation: "business_types"
            referencedColumns: ["code"]
          },
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
          source_task_id: string | null
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
          source_task_id?: string | null
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
          source_task_id?: string | null
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
          {
            foreignKeyName: "care_entries_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "pet_care_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      care_targets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["care_entry_kind"]
          label: string
          period: string
          pet_id: string
          sort_order: number
          target_amount: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["care_entry_kind"]
          label: string
          period?: string
          pet_id: string
          sort_order?: number
          target_amount?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["care_entry_kind"]
          label?: string
          period?: string
          pet_id?: string
          sort_order?: number
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
      clinic_customers: {
        Row: {
          address: string | null
          alert_note: string | null
          alt_phone: string | null
          business_id: string
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          import_batch_id: string | null
          is_active: boolean
          last_name: string | null
          marketing_consent: boolean
          notes: string | null
          phone: string | null
          postal_code: string | null
          profile_id: string | null
          region: string | null
          service_reminders: boolean
          updated_at: string
        }
        Insert: {
          address?: string | null
          alert_note?: string | null
          alt_phone?: string | null
          business_id: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          last_name?: string | null
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          region?: string | null
          service_reminders?: boolean
          updated_at?: string
        }
        Update: {
          address?: string | null
          alert_note?: string | null
          alt_phone?: string | null
          business_id?: string
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          last_name?: string | null
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_id?: string | null
          region?: string | null
          service_reminders?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clinic_customers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_customers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      clinic_patients: {
        Row: {
          allergies: string | null
          behavioural_alert: string | null
          breed: string | null
          business_id: string
          colour: string | null
          conditions: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deceased_on: string | null
          dob: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          is_deceased: boolean
          medications_notes: string | null
          microchip: string | null
          name: string
          neutered: boolean | null
          notes: string | null
          pet_id: string | null
          sex: Database["public"]["Enums"]["pet_sex"] | null
          species: Database["public"]["Enums"]["pet_species"]
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          allergies?: string | null
          behavioural_alert?: string | null
          breed?: string | null
          business_id: string
          colour?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deceased_on?: string | null
          dob?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deceased?: boolean
          medications_notes?: string | null
          microchip?: string | null
          name: string
          neutered?: boolean | null
          notes?: string | null
          pet_id?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          species?: Database["public"]["Enums"]["pet_species"]
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          allergies?: string | null
          behavioural_alert?: string | null
          breed?: string | null
          business_id?: string
          colour?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deceased_on?: string | null
          dob?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          is_deceased?: boolean
          medications_notes?: string | null
          microchip?: string | null
          name?: string
          neutered?: boolean | null
          notes?: string | null
          pet_id?: string | null
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          species?: Database["public"]["Enums"]["pet_species"]
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_patients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clinic_patients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_patients_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_patients_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_resources: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          location_id: string | null
          name: string
          sort_order: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          location_id?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          location_id?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_resources_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_tasks: {
        Row: {
          assigned_to: string | null
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          detail: string | null
          done_at: string | null
          due_on: string | null
          id: string
          patient_id: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          detail?: string | null
          done_at?: string | null
          due_on?: string | null
          id?: string
          patient_id?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          detail?: string | null
          done_at?: string | null
          due_on?: string | null
          id?: string
          patient_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_tasks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "clinic_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_log: {
        Row: {
          body: string | null
          business_id: string
          channel: string
          created_at: string
          customer_id: string | null
          direction: string
          id: string
          occurred_at: string
          outcome: string | null
          patient_id: string | null
          staff_id: string | null
          subject: string | null
        }
        Insert: {
          body?: string | null
          business_id: string
          channel: string
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          outcome?: string | null
          patient_id?: string | null
          staff_id?: string | null
          subject?: string | null
        }
        Update: {
          body?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          outcome?: string | null
          patient_id?: string | null
          staff_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
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
      emergency_arrivals: {
        Row: {
          allergies: string | null
          business_id: string
          contact_phone: string | null
          created_at: string
          eta_minutes: number | null
          id: string
          location_id: string | null
          patient_id: string | null
          pet_id: string | null
          pet_name: string | null
          problem: string
          reported_by: string | null
          species: Database["public"]["Enums"]["pet_species"] | null
          status: string
          triage_level: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          allergies?: string | null
          business_id: string
          contact_phone?: string | null
          created_at?: string
          eta_minutes?: number | null
          id?: string
          location_id?: string | null
          patient_id?: string | null
          pet_id?: string | null
          pet_name?: string | null
          problem: string
          reported_by?: string | null
          species?: Database["public"]["Enums"]["pet_species"] | null
          status?: string
          triage_level?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          allergies?: string | null
          business_id?: string
          contact_phone?: string | null
          created_at?: string
          eta_minutes?: number | null
          id?: string
          location_id?: string | null
          patient_id?: string | null
          pet_id?: string | null
          pet_name?: string | null
          problem?: string
          reported_by?: string | null
          species?: Database["public"]["Enums"]["pet_species"] | null
          status?: string
          triage_level?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_arrivals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_arrivals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_arrivals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_arrivals_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_arrivals_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_arrivals_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      emergency_pulls: {
        Row: {
          business_id: string
          id: string
          owner_notified_at: string | null
          pet_id: string
          pulled_at: string
          reason: string
          review_outcome: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_profile_id: string | null
        }
        Insert: {
          business_id: string
          id?: string
          owner_notified_at?: string | null
          pet_id: string
          pulled_at?: string
          reason: string
          review_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id?: string | null
        }
        Update: {
          business_id?: string
          id?: string
          owner_notified_at?: string | null
          pet_id?: string
          pulled_at?: string
          reason?: string
          review_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_pulls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_pulls_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_pulls_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_pulls_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "emergency_pulls_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_pulls_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
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
          building_id: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          max_attendees: number | null
          starts_at: string
          title: string
        }
        Insert: {
          building_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          starts_at: string
          title: string
        }
        Update: {
          building_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          max_attendees?: number | null
          starts_at?: string
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
      import_batches: {
        Row: {
          business_id: string
          committed_at: string | null
          created_at: string
          created_by: string | null
          created_count: number
          error_note: string | null
          filename: string | null
          id: string
          kind: string
          mapping: Json
          row_count: number
          status: string
          undone_at: string | null
        }
        Insert: {
          business_id: string
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_note?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mapping?: Json
          row_count?: number
          status?: string
          undone_at?: string | null
        }
        Update: {
          business_id?: string
          committed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_note?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mapping?: Json
          row_count?: number
          status?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
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
          pet_id: string | null
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
          pet_id?: string | null
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
          pet_id?: string | null
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
            foreignKeyName: "incident_reports_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
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
      invoice_lines: {
        Row: {
          business_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          product_id: string | null
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          business_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          product_id?: string | null
          quantity?: number
          unit_price_cents?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          due_on: string | null
          id: string
          issued_on: string | null
          kind: string
          note: string | null
          number: string | null
          owner_approved_at: string | null
          paid_cents: number
          patient_id: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          due_on?: string | null
          id?: string
          issued_on?: string | null
          kind?: string
          note?: string | null
          number?: string | null
          owner_approved_at?: string | null
          paid_cents?: number
          patient_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          due_on?: string | null
          id?: string
          issued_on?: string | null
          kind?: string
          note?: string | null
          number?: string | null
          owner_approved_at?: string | null
          paid_cents?: number
          patient_id?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found: {
        Row: {
          breed: string | null
          building_id: string
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
          building_id: string
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
          building_id?: string
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
      message_templates: {
        Row: {
          body: string
          business_id: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          business_id: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          business_id?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      municipal_reports: {
        Row: {
          created_at: string
          description: string
          evidence_paths: string[]
          id: string
          ip_hash: string | null
          is_anonymous: boolean
          latitude: number | null
          location_text: string | null
          longitude: number | null
          municipality_id: string | null
          postal_code: string | null
          reference_code: string | null
          reporter_id: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          evidence_paths?: string[]
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          municipality_id?: string | null
          postal_code?: string | null
          reference_code?: string | null
          reporter_id?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string
          evidence_paths?: string[]
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          municipality_id?: string | null
          postal_code?: string | null
          reference_code?: string | null
          reporter_id?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "municipal_reports_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "municipalities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "municipal_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "municipal_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      municipalities: {
        Row: {
          animal_control_phone: string | null
          animal_control_url: string | null
          country: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          postal_prefixes: string[]
          region: string | null
          updated_at: string
        }
        Insert: {
          animal_control_phone?: string | null
          animal_control_url?: string | null
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          postal_prefixes?: string[]
          region?: string | null
          updated_at?: string
        }
        Update: {
          animal_control_phone?: string | null
          animal_control_url?: string | null
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          postal_prefixes?: string[]
          region?: string | null
          updated_at?: string
        }
        Relationships: []
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
      on_call_shifts: {
        Row: {
          business_id: string
          created_at: string
          ends_at: string
          id: string
          location_id: string | null
          note: string | null
          phone: string | null
          staff_id: string | null
          starts_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          ends_at: string
          id?: string
          location_id?: string | null
          note?: string | null
          phone?: string | null
          staff_id?: string | null
          starts_at: string
        }
        Update: {
          business_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          location_id?: string | null
          note?: string | null
          phone?: string | null
          staff_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "on_call_shifts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "on_call_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_link_requests: {
        Row: {
          business_id: string
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          invite_email: string | null
          message: string | null
          patient_id: string
          pet_id: string | null
          profile_id: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          invite_email?: string | null
          message?: string | null
          patient_id: string
          pet_id?: string | null
          profile_id?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          invite_email?: string | null
          message?: string | null
          patient_id?: string
          pet_id?: string | null
          profile_id?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_link_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_link_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_link_requests_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_link_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_link_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "patient_link_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_link_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      patient_vaccinations: {
        Row: {
          administered_by: string | null
          batch: string | null
          business_id: string
          created_at: string
          expires_on: string | null
          given_on: string
          id: string
          name: string
          note: string | null
          patient_id: string
          product: string | null
          visit_id: string | null
        }
        Insert: {
          administered_by?: string | null
          batch?: string | null
          business_id: string
          created_at?: string
          expires_on?: string | null
          given_on?: string
          id?: string
          name: string
          note?: string | null
          patient_id: string
          product?: string | null
          visit_id?: string | null
        }
        Update: {
          administered_by?: string | null
          batch?: string | null
          business_id?: string
          created_at?: string
          expires_on?: string | null
          given_on?: string
          id?: string
          name?: string
          note?: string | null
          patient_id?: string
          product?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_vaccinations_administered_by_fkey"
            columns: ["administered_by"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vaccinations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vaccinations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_vaccinations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
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
      pending_signups: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          last_sent_at: string
          send_count: number
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          full_name?: string | null
          last_sent_at?: string
          send_count?: number
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          last_sent_at?: string
          send_count?: number
        }
        Relationships: []
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
      pet_care_reminders: {
        Row: {
          id: string
          notification_id: string | null
          on_date: string
          sent_at: string
          task_id: string
        }
        Insert: {
          id?: string
          notification_id?: string | null
          on_date: string
          sent_at?: string
          task_id: string
        }
        Update: {
          id?: string
          notification_id?: string | null
          on_date?: string
          sent_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_reminders_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_reminders_task_id_fkey"
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
          days_of_week: number[] | null
          detail: string | null
          dose: string | null
          ends_on: string | null
          id: string
          interval_days: number | null
          is_active: boolean
          kind: Database["public"]["Enums"]["care_kind"]
          label: string
          log_amount: number | null
          next_due_on: string | null
          pet_id: string
          recurrence: string
          remind_minutes_before: number
          scheduled_at: string | null
          sort_order: number | null
          starts_on: string | null
          target_id: string | null
          time_label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          detail?: string | null
          dose?: string | null
          ends_on?: string | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["care_kind"]
          label: string
          log_amount?: number | null
          next_due_on?: string | null
          pet_id: string
          recurrence?: string
          remind_minutes_before?: number
          scheduled_at?: string | null
          sort_order?: number | null
          starts_on?: string | null
          target_id?: string | null
          time_label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          detail?: string | null
          dose?: string | null
          ends_on?: string | null
          id?: string
          interval_days?: number | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["care_kind"]
          label?: string
          log_amount?: number | null
          next_due_on?: string | null
          pet_id?: string
          recurrence?: string
          remind_minutes_before?: number
          scheduled_at?: string | null
          sort_order?: number | null
          starts_on?: string | null
          target_id?: string | null
          time_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_care_tasks_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_care_tasks_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "care_targets"
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
          provenance: string
          publication_id: string | null
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          verified_at: string | null
          verified_by: string | null
          verified_by_business: string | null
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          kind: Database["public"]["Enums"]["doc_kind"]
          name?: string | null
          pet_id?: string | null
          provenance?: string
          publication_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_business?: string | null
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["doc_kind"]
          name?: string | null
          pet_id?: string | null
          provenance?: string
          publication_id?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_business?: string | null
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
            foreignKeyName: "pet_documents_verified_by_business_fkey"
            columns: ["verified_by_business"]
            isOneToOne: false
            referencedRelation: "businesses"
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
          next_due_at: string | null
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
          next_due_at?: string | null
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
          next_due_at?: string | null
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
      pet_photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          path: string
          pet_id: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          path: string
          pet_id: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          path?: string
          pet_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pet_photos_pet_id_fkey"
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
          kind: string
          name: string
          pet_id: string
          provenance: string
          publication_id: string | null
          remind_days_before: number
          reminded_for: string | null
          status: Database["public"]["Enums"]["doc_status"]
          verified_by_business: string | null
        }
        Insert: {
          created_at?: string
          doc_id?: string | null
          expires_on?: string | null
          given_on?: string | null
          id?: string
          kind?: string
          name: string
          pet_id: string
          provenance?: string
          publication_id?: string | null
          remind_days_before?: number
          reminded_for?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          verified_by_business?: string | null
        }
        Update: {
          created_at?: string
          doc_id?: string | null
          expires_on?: string | null
          given_on?: string | null
          id?: string
          kind?: string
          name?: string
          pet_id?: string
          provenance?: string
          publication_id?: string | null
          remind_days_before?: number
          reminded_for?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          verified_by_business?: string | null
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
          {
            foreignKeyName: "pet_vaccinations_verified_by_business_fkey"
            columns: ["verified_by_business"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_vet_visits: {
        Row: {
          clinic: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          follow_up_on: string | null
          id: string
          notes: string | null
          pet_id: string
          reason: string
          vet_name: string | null
          visited_on: string
        }
        Insert: {
          clinic?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          follow_up_on?: string | null
          id?: string
          notes?: string | null
          pet_id: string
          reason: string
          vet_name?: string | null
          visited_on: string
        }
        Update: {
          clinic?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          follow_up_on?: string | null
          id?: string
          notes?: string | null
          pet_id?: string
          reason?: string
          vet_name?: string | null
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_vet_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_vet_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pet_vet_visits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "pet_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_vet_visits_pet_id_fkey"
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
          diet_notes: string | null
          diet_type: string | null
          dob: string | null
          grandfathered_on: string | null
          height_cm: number | null
          id: string
          image_url: string | null
          is_grandfathered: boolean | null
          medications_notes: string | null
          microchip: string | null
          name: string
          neutered: boolean | null
          owner_id: string
          registration_status: Database["public"]["Enums"]["registration_status"]
          restraints: string[]
          sex: Database["public"]["Enums"]["pet_sex"] | null
          size_band: string | null
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
          diet_notes?: string | null
          diet_type?: string | null
          dob?: string | null
          grandfathered_on?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          is_grandfathered?: boolean | null
          medications_notes?: string | null
          microchip?: string | null
          name: string
          neutered?: boolean | null
          owner_id: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          restraints?: string[]
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          size_band?: string | null
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
          diet_notes?: string | null
          diet_type?: string | null
          dob?: string | null
          grandfathered_on?: string | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          is_grandfathered?: boolean | null
          medications_notes?: string | null
          microchip?: string | null
          name?: string
          neutered?: boolean | null
          owner_id?: string
          registration_status?: Database["public"]["Enums"]["registration_status"]
          restraints?: string[]
          sex?: Database["public"]["Enums"]["pet_sex"] | null
          size_band?: string | null
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
      products: {
        Row: {
          business_id: string
          category: string | null
          cost_cents: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_cents: number
          reorder_point: number | null
          sku: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          category?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          reorder_point?: number | null
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          category?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          reorder_point?: number | null
          sku?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_unit: string | null
          ai_consent_at: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
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
          postal_code: string | null
          region: string | null
          role: Database["public"]["Enums"]["user_role"]
          street_address: string | null
          suspended_at: string | null
          suspended_by: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address_unit?: string | null
          ai_consent_at?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
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
          postal_code?: string | null
          region?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          street_address?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address_unit?: string | null
          ai_consent_at?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
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
          postal_code?: string | null
          region?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          street_address?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          timezone?: string | null
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
      record_access_log: {
        Row: {
          basis: string
          business_id: string
          id: string
          occurred_at: string
          patient_id: string | null
          pet_id: string | null
          scopes: string[]
          staff_profile_id: string | null
        }
        Insert: {
          basis?: string
          business_id: string
          id?: string
          occurred_at?: string
          patient_id?: string | null
          pet_id?: string | null
          scopes?: string[]
          staff_profile_id?: string | null
        }
        Update: {
          basis?: string
          business_id?: string
          id?: string
          occurred_at?: string
          patient_id?: string | null
          pet_id?: string | null
          scopes?: string[]
          staff_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_access_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_access_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_access_log_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_access_log_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_access_log_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      record_desk_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          pet_id: string
          profile_id: string
          redeemed_at: string | null
          redeemed_by_business: string | null
          scopes: string[]
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          pet_id: string
          profile_id: string
          redeemed_at?: string | null
          redeemed_by_business?: string | null
          scopes?: string[]
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          pet_id?: string
          profile_id?: string
          redeemed_at?: string | null
          redeemed_by_business?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "record_desk_codes_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_desk_codes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_desk_codes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "record_desk_codes_redeemed_by_business_fkey"
            columns: ["redeemed_by_business"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      record_publications: {
        Row: {
          business_id: string
          created_at: string
          id: string
          patient_id: string
          pet_id: string
          published_at: string
          published_by: string | null
          source_id: string | null
          source_kind: string
          summary: string | null
          target_id: string | null
          target_kind: string | null
          title: string
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          patient_id: string
          pet_id: string
          published_at?: string
          published_by?: string | null
          source_id?: string | null
          source_kind: string
          summary?: string | null
          target_id?: string | null
          target_kind?: string | null
          title: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          pet_id?: string
          published_at?: string
          published_by?: string | null
          source_id?: string | null
          source_kind?: string
          summary?: string | null
          target_id?: string | null
          target_kind?: string | null
          title?: string
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_publications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_publications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_publications_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "record_publications_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_publications_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      record_share_requests: {
        Row: {
          business_id: string
          created_at: string
          decided_at: string | null
          expires_at: string
          id: string
          message: string | null
          patient_id: string | null
          pet_id: string
          profile_id: string
          requested_by: string | null
          scopes: string[]
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          pet_id: string
          profile_id: string
          requested_by?: string | null
          scopes?: string[]
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          decided_at?: string | null
          expires_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          pet_id?: string
          profile_id?: string
          requested_by?: string | null
          scopes?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_share_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_share_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_share_requests_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_share_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_share_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "record_share_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_share_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      record_shares: {
        Row: {
          business_id: string
          created_at: string
          created_via: string
          expires_at: string | null
          granted_by: string
          id: string
          note: string | null
          pet_id: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          starts_at: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_via?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          note?: string | null
          pet_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          starts_at?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_via?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          note?: string | null
          pet_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_shares_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_shares_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_shares_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "record_shares_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      reminder_items: {
        Row: {
          appointment_id: string | null
          business_id: string
          channel: string
          created_at: string
          customer_id: string | null
          due_on: string
          handled_by: string | null
          id: string
          kind: string
          label: string
          note: string | null
          notification_id: string | null
          patient_id: string | null
          rule_id: string | null
          sent_at: string | null
          snoozed_until: string | null
          source_id: string | null
          source_kind: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          business_id: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          due_on: string
          handled_by?: string | null
          id?: string
          kind: string
          label: string
          note?: string | null
          notification_id?: string | null
          patient_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          source_id?: string | null
          source_kind?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          customer_id?: string | null
          due_on?: string
          handled_by?: string | null
          id?: string
          kind?: string
          label?: string
          note?: string | null
          notification_id?: string | null
          patient_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          source_id?: string | null
          source_kind?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reminder_items_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "reminder_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          business_id: string
          channel: string
          cooldown_days: number
          created_at: string
          id: string
          is_active: boolean
          lapse_days: number
          lead_days: number
          name: string
          template_id: string | null
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          business_id: string
          channel?: string
          cooldown_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lapse_days?: number
          lead_days?: number
          name: string
          template_id?: string | null
          trigger_kind: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          channel?: string
          cooldown_days?: number
          created_at?: string
          id?: string
          is_active?: boolean
          lapse_days?: number
          lead_days?: number
          name?: string
          template_id?: string | null
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
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
          info_requested_at: string | null
          info_requested_by: string | null
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
          info_requested_at?: string | null
          info_requested_by?: string | null
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
          info_requested_at?: string | null
          info_requested_by?: string | null
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
            foreignKeyName: "resident_links_info_requested_by_fkey"
            columns: ["info_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_links_info_requested_by_fkey"
            columns: ["info_requested_by"]
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
          currency: string
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
          currency?: string
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
          currency?: string
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
      shop_items: {
        Row: {
          affiliate_url: string
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          merchant: string | null
          price_label: string | null
          sort_order: number
          species: string[]
          title: string
          updated_at: string
        }
        Insert: {
          affiliate_url: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          merchant?: string | null
          price_label?: string | null
          sort_order?: number
          species?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          affiliate_url?: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          merchant?: string | null
          price_label?: string | null
          sort_order?: number
          species?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      staff_availability: {
        Row: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          location_id: string | null
          staff_id: string
          start_time: string
          valid_from: string | null
          valid_to: string | null
          weekday: number
        }
        Insert: {
          business_id: string
          created_at?: string
          end_time: string
          id?: string
          location_id?: string | null
          staff_id: string
          start_time: string
          valid_from?: string | null
          valid_to?: string | null
          weekday: number
        }
        Update: {
          business_id?: string
          created_at?: string
          end_time?: string
          id?: string
          location_id?: string | null
          staff_id?: string
          start_time?: string
          valid_from?: string | null
          valid_to?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          business_id: string
          created_at: string
          ends_at: string
          id: string
          reason: string | null
          staff_id: string
          starts_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          ends_at: string
          id?: string
          reason?: string | null
          staff_id: string
          starts_at: string
        }
        Update: {
          business_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string | null
          staff_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          business_id: string
          id: string
          location_id: string | null
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          business_id: string
          id?: string
          location_id?: string | null
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          location_id?: string | null
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      violation_disputes: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decided_note: string | null
          filed_at: string
          filed_by: string
          id: string
          outcome: Database["public"]["Enums"]["dispute_outcome"] | null
          reason: string
          stage: Database["public"]["Enums"]["violation_stage_v2"]
          violation_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          filed_at?: string
          filed_by: string
          id?: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"] | null
          reason: string
          stage: Database["public"]["Enums"]["violation_stage_v2"]
          violation_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decided_note?: string | null
          filed_at?: string
          filed_by?: string
          id?: string
          outcome?: Database["public"]["Enums"]["dispute_outcome"] | null
          reason?: string
          stage?: Database["public"]["Enums"]["violation_stage_v2"]
          violation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "violation_disputes_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_disputes_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violation_disputes_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_disputes_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violation_disputes_violation_id_fkey"
            columns: ["violation_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
        ]
      }
      violation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["violation_stage_v2"] | null
          id: string
          note: string | null
          occurred_on: string | null
          to_stage: Database["public"]["Enums"]["violation_stage_v2"]
          violation_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["violation_stage_v2"] | null
          id?: string
          note?: string | null
          occurred_on?: string | null
          to_stage: Database["public"]["Enums"]["violation_stage_v2"]
          violation_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["violation_stage_v2"] | null
          id?: string
          note?: string | null
          occurred_on?: string | null
          to_stage?: Database["public"]["Enums"]["violation_stage_v2"]
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
      violation_notice_kinds: {
        Row: {
          code: string
          creates_fine: boolean
          default_visible: boolean
          description: string | null
          is_active: boolean
          label: string
          requires_amount: boolean
          requires_body: boolean
          sort_order: number
          stage_target: string | null
          tone: string
        }
        Insert: {
          code: string
          creates_fine?: boolean
          default_visible?: boolean
          description?: string | null
          is_active?: boolean
          label: string
          requires_amount?: boolean
          requires_body?: boolean
          sort_order?: number
          stage_target?: string | null
          tone?: string
        }
        Update: {
          code?: string
          creates_fine?: boolean
          default_visible?: boolean
          description?: string | null
          is_active?: boolean
          label?: string
          requires_amount?: boolean
          requires_body?: boolean
          sort_order?: number
          stage_target?: string | null
          tone?: string
        }
        Relationships: []
      }
      violation_notices: {
        Row: {
          amount_cents: number | null
          body: string | null
          building_id: string
          currency: string
          due_on: string | null
          fine_id: string | null
          id: string
          issued_at: string
          issued_by: string | null
          kind: string
          stage_after: Database["public"]["Enums"]["violation_stage_v2"] | null
          title: string | null
          violation_id: string
          visible_to_resident: boolean
        }
        Insert: {
          amount_cents?: number | null
          body?: string | null
          building_id: string
          currency?: string
          due_on?: string | null
          fine_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind: string
          stage_after?: Database["public"]["Enums"]["violation_stage_v2"] | null
          title?: string | null
          violation_id: string
          visible_to_resident?: boolean
        }
        Update: {
          amount_cents?: number | null
          body?: string | null
          building_id?: string
          currency?: string
          due_on?: string | null
          fine_id?: string | null
          id?: string
          issued_at?: string
          issued_by?: string | null
          kind?: string
          stage_after?: Database["public"]["Enums"]["violation_stage_v2"] | null
          title?: string | null
          violation_id?: string
          visible_to_resident?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "violation_notices_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_notices_fine_id_fkey"
            columns: ["fine_id"]
            isOneToOne: false
            referencedRelation: "fines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_notices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "violation_notices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "violation_notices_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "violation_notice_kinds"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "violation_notices_violation_id_fkey"
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
          stage: Database["public"]["Enums"]["violation_stage_v2"]
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
          stage?: Database["public"]["Enums"]["violation_stage_v2"]
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
          stage?: Database["public"]["Enums"]["violation_stage_v2"]
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
      visit_attachments: {
        Row: {
          business_id: string
          created_at: string
          id: string
          label: string | null
          mime_type: string | null
          patient_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
          visit_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          patient_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          patient_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visit_attachments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "visit_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_services: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          note: string | null
          quantity: number
          unit_price_cents: number
          visit_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          note?: string | null
          quantity?: number
          unit_price_cents?: number
          visit_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          quantity?: number
          unit_price_cents?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_services_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          appointment_id: string | null
          business_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          internal_note: string | null
          next_due_on: string | null
          next_due_reason: string | null
          patient_id: string
          reason: string | null
          staff_id: string | null
          status: string
          summary: string | null
          temperature_c: number | null
          updated_at: string
          visited_on: string
          weight_grams: number | null
        }
        Insert: {
          appointment_id?: string | null
          business_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          internal_note?: string | null
          next_due_on?: string | null
          next_due_reason?: string | null
          patient_id: string
          reason?: string | null
          staff_id?: string | null
          status?: string
          summary?: string | null
          temperature_c?: number | null
          updated_at?: string
          visited_on?: string
          weight_grams?: number | null
        }
        Update: {
          appointment_id?: string | null
          business_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          internal_note?: string | null
          next_due_on?: string | null
          next_due_reason?: string | null
          patient_id?: string
          reason?: string | null
          staff_id?: string | null
          status?: string
          summary?: string | null
          temperature_c?: number | null
          updated_at?: string
          visited_on?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "business_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          earliest_on: string | null
          id: string
          latest_on: string | null
          note: string | null
          offered_at: string | null
          patient_id: string | null
          status: string
          type_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          earliest_on?: string | null
          id?: string
          latest_on?: string | null
          note?: string | null
          offered_at?: string | null
          patient_id?: string | null
          status?: string
          type_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          earliest_on?: string | null
          id?: string
          latest_on?: string | null
          note?: string | null
          offered_at?: string | null
          patient_id?: string | null
          status?: string
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_entitlements"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "waitlist_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clinic_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "clinic_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "appointment_types"
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
      accommodation_required_kinds: {
        Args: { p_type: Database["public"]["Enums"]["accommodation_type"] }
        Returns: Database["public"]["Enums"]["doc_kind"][]
      }
      ai_expired_chat_media: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          path: string
        }[]
      }
      ai_forget_chat_media: { Args: { p_paths: string[] }; Returns: number }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      building_allows_direct_fine: {
        Args: { p_building: string }
        Returns: boolean
      }
      building_pets_for_report: { Args: { p_code: string }; Returns: Json }
      buildings_matching_my_address: { Args: never; Returns: Json }
      business_has_module: {
        Args: { p_business: string; p_module: string }
        Returns: boolean
      }
      business_is_public: { Args: { p_business: string }; Returns: boolean }
      business_mark_booking_paid: {
        Args: { p_booking: string }
        Returns: string
      }
      business_tier_of: {
        Args: { p_business: string }
        Returns: Database["public"]["Enums"]["business_tier"]
      }
      can_admin_business: { Args: { p_business: string }; Returns: boolean }
      can_read_shared_records: {
        Args: { p_business: string }
        Returns: boolean
      }
      clinic_available_slots: {
        Args: {
          p_business: string
          p_date: string
          p_location?: string
          p_type: string
        }
        Returns: Json
      }
      clinic_emergency_pull: {
        Args: { p_business: string; p_pet: string; p_reason: string }
        Returns: Json
      }
      clinic_fetch_shared_record: { Args: { p_patient: string }; Returns: Json }
      clinic_generate_reminders: { Args: { p_business: string }; Returns: Json }
      clinic_may_read: {
        Args: { p_pet: string; p_scope: string }
        Returns: boolean
      }
      clinic_open_visit: { Args: { p_appointment: string }; Returns: string }
      clinic_publish_record: {
        Args: { p_patient: string; p_source_id: string; p_source_kind: string }
        Returns: Json
      }
      clinic_redeem_desk_code: {
        Args: { p_business: string; p_code: string; p_patient?: string }
        Returns: Json
      }
      clinic_reminder_action: {
        Args: {
          p_action: string
          p_days?: number
          p_item: string
          p_note?: string
        }
        Returns: Json
      }
      clinic_request_pet_details: {
        Args: {
          p_email?: string
          p_message?: string
          p_patient: string
          p_scopes?: string[]
        }
        Returns: Json
      }
      clinic_set_appointment_status: {
        Args: {
          p_appointment: string
          p_note?: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: Json
      }
      clinic_set_invoice_status: {
        Args: { p_invoice: string; p_paid_cents?: number; p_status: string }
        Returns: Json
      }
      clinic_withdraw_publication: {
        Args: { p_publication: string; p_reason?: string }
        Returns: Json
      }
      community_identities: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      dispute_violation: {
        Args: { p_reason: string; p_violation: string }
        Returns: Json
      }
      email_is_registered: { Args: { p_email: string }; Returns: boolean }
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
      manager_advance_violation: {
        Args: {
          p_amount_cents?: number
          p_due_on?: string
          p_note?: string
          p_notify?: boolean
          p_to_stage: Database["public"]["Enums"]["violation_stage_v2"]
          p_violation: string
        }
        Returns: Json
      }
      manager_decide_accommodation: {
        Args: {
          p_note?: string
          p_outcome: Database["public"]["Enums"]["accommodation_status"]
          p_request: string
        }
        Returns: Json
      }
      manager_decide_registration: {
        Args: { p_approve: boolean; p_pet: string }
        Returns: undefined
      }
      manager_issue_notice: {
        Args: {
          p_amount_cents?: number
          p_body?: string
          p_due_on?: string
          p_kind: string
          p_notify?: boolean
          p_title?: string
          p_violation: string
          p_visible?: boolean
        }
        Returns: Json
      }
      manager_remind_fine: {
        Args: { p_note?: string; p_violation: string }
        Returns: Json
      }
      manager_resolve_dispute: {
        Args: {
          p_note?: string
          p_outcome: Database["public"]["Enums"]["dispute_outcome"]
          p_violation: string
        }
        Returns: Json
      }
      manager_save_building_rule: {
        Args: {
          p_body: string
          p_building: string
          p_category: Database["public"]["Enums"]["building_rule_category"]
          p_rule: string
          p_sort_order?: number
          p_title: string
        }
        Returns: Json
      }
      manager_set_fine_schedule: {
        Args: {
          p_building: string
          p_currency?: string
          p_fine_1_cents: number
          p_fine_2_cents: number
        }
        Returns: Json
      }
      manager_verify_accommodation_document: {
        Args: { p_document: string; p_note?: string; p_verified: boolean }
        Returns: Json
      }
      manages_building: { Args: { b: string }; Returns: boolean }
      moderate_community_post: {
        Args: { p_post: string; p_reason?: string }
        Returns: Json
      }
      my_app_user: { Args: never; Returns: Json }
      my_building_link: { Args: never; Returns: Json }
      my_personas: { Args: never; Returns: Json }
      owner_approve_estimate: { Args: { p_invoice: string }; Returns: Json }
      owner_book_appointment: {
        Args: {
          p_business: string
          p_note?: string
          p_pet: string
          p_share?: boolean
          p_staff?: string
          p_starts_at: string
          p_type: string
        }
        Returns: Json
      }
      owner_create_desk_code: {
        Args: { p_pet: string; p_scopes?: string[] }
        Returns: Json
      }
      owner_decide_patient_link: {
        Args: { p_accept: boolean; p_pet?: string; p_request: string }
        Returns: Json
      }
      owner_decide_share_request: {
        Args: { p_approve: boolean; p_request: string }
        Returns: Json
      }
      owner_grant_record_share: {
        Args: {
          p_business: string
          p_expires_at?: string
          p_pet: string
          p_scopes?: string[]
          p_via?: string
        }
        Returns: Json
      }
      owner_notify_arrival: {
        Args: {
          p_business: string
          p_eta_minutes?: number
          p_pet: string
          p_problem: string
        }
        Returns: Json
      }
      owner_revoke_record_share: { Args: { p_share: string }; Returns: Json }
      owner_unlink_patient: { Args: { p_patient: string }; Returns: Json }
      publish_building_event: {
        Args: { p_event: string; p_note?: string }
        Returns: Json
      }
      publish_building_rule: {
        Args: { p_notify?: boolean; p_published?: boolean; p_rule: string }
        Returns: Json
      }
      purge_expired_pending_signups: { Args: never; Returns: number }
      record_accommodation_document: {
        Args: {
          p_kind: Database["public"]["Enums"]["doc_kind"]
          p_label?: string
          p_mime?: string
          p_path: string
          p_request: string
          p_size?: number
        }
        Returns: Json
      }
      report_lost_found: {
        Args: {
          p_breed?: string
          p_color?: string
          p_image_path?: string
          p_kind: string
          p_last_seen?: string
          p_pet_name?: string
          p_reward_cents?: number
          p_species?: Database["public"]["Enums"]["pet_species"]
        }
        Returns: Json
      }
      request_building_link: { Args: { p_code: string }; Returns: Json }
      resolve_building_code: { Args: { p_code: string }; Returns: Json }
      resolve_entitlement: {
        Args: { p_user: string }
        Returns: Database["public"]["Enums"]["entitlement_source"]
      }
      resolve_municipality: {
        Args: { p_lat?: number; p_lng?: number; p_postal?: string }
        Returns: Json
      }
      search_buildings_public: { Args: { q: string }; Returns: Json }
      set_my_unit: { Args: { p_unit: string }; Returns: Json }
      shares_managed_building_with: { Args: { p: string }; Returns: boolean }
      staff_of_business: { Args: { p_business: string }; Returns: boolean }
      staff_role_in: {
        Args: { p_business: string }
        Returns: Database["public"]["Enums"]["clinic_staff_role"]
      }
      submit_accommodation_request: {
        Args: { p_request: string }
        Returns: Json
      }
      submit_incident_report: {
        Args: {
          p_anonymous?: boolean
          p_building_code: string
          p_description: string
          p_evidence_paths?: string[]
          p_location?: string
          p_pet_id?: string
          p_type: string
          p_unit?: string
        }
        Returns: Json
      }
      submit_municipal_report: {
        Args: {
          p_anonymous?: boolean
          p_description: string
          p_lat?: number
          p_lng?: number
          p_location?: string
          p_postal?: string
          p_type: string
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
      text_present: { Args: { p: string }; Returns: string }
      withdraw_accommodation_request: {
        Args: { p_reason?: string; p_request: string }
        Returns: Json
      }
    }
    Enums: {
      accommodation_status:
        | "draft"
        | "pending"
        | "approved"
        | "denied"
        | "info_requested"
        | "withdrawn"
      accommodation_type: "esa" | "service_animal"
      appointment_status:
        | "requested"
        | "booked"
        | "arrived"
        | "in_progress"
        | "ready"
        | "completed"
        | "no_show"
        | "cancelled"
      booking_status:
        | "requested"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "paid"
        | "declined"
        | "cancelled"
      building_rule_category:
        | "pets"
        | "parking"
        | "noise"
        | "waste"
        | "common_areas"
        | "other"
      business_listing_tier: "basic" | "featured" | "premium"
      business_tier: "registered" | "listed" | "verified"
      care_entry_kind:
        | "food"
        | "medicine"
        | "treat"
        | "water"
        | "walk"
        | "weight"
        | "potty"
        | "other"
        | "play"
        | "outing"
      care_kind: "meal" | "medication" | "water" | "walk" | "grooming" | "other"
      clinic_staff_role:
        | "owner"
        | "manager"
        | "veterinarian"
        | "nurse"
        | "reception"
      dispute_outcome: "upheld" | "overturned"
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
        | "assistant"
        | "care"
        | "appointment"
        | "reminder"
        | "clinic"
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
      violation_stage_v2:
        | "open"
        | "warning"
        | "fine_1"
        | "fine_2"
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
      accommodation_status: [
        "draft",
        "pending",
        "approved",
        "denied",
        "info_requested",
        "withdrawn",
      ],
      accommodation_type: ["esa", "service_animal"],
      appointment_status: [
        "requested",
        "booked",
        "arrived",
        "in_progress",
        "ready",
        "completed",
        "no_show",
        "cancelled",
      ],
      booking_status: [
        "requested",
        "confirmed",
        "in_progress",
        "completed",
        "paid",
        "declined",
        "cancelled",
      ],
      building_rule_category: [
        "pets",
        "parking",
        "noise",
        "waste",
        "common_areas",
        "other",
      ],
      business_listing_tier: ["basic", "featured", "premium"],
      business_tier: ["registered", "listed", "verified"],
      care_entry_kind: [
        "food",
        "medicine",
        "treat",
        "water",
        "walk",
        "weight",
        "potty",
        "other",
        "play",
        "outing",
      ],
      care_kind: ["meal", "medication", "water", "walk", "grooming", "other"],
      clinic_staff_role: [
        "owner",
        "manager",
        "veterinarian",
        "nurse",
        "reception",
      ],
      dispute_outcome: ["upheld", "overturned"],
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
        "assistant",
        "care",
        "appointment",
        "reminder",
        "clinic",
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
      violation_stage_v2: [
        "open",
        "warning",
        "fine_1",
        "fine_2",
        "resolved",
        "dismissed",
      ],
    },
  },
} as const
