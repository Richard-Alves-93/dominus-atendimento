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
      audit_logs: {
        Row: {
          changed_by: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          new_assigned_user_id: string | null
          previous_assigned_user_id: string | null
          reason: string | null
          ticket_id: string | null
        }
        Insert: {
          changed_by?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_assigned_user_id?: string | null
          previous_assigned_user_id?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Update: {
          changed_by?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_assigned_user_id?: string | null
          previous_assigned_user_id?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_sync_logs: {
        Row: {
          channel_id: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          metadata: Json
          status: string | null
        }
        Insert: {
          channel_id?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json
          status?: string | null
        }
        Update: {
          channel_id?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_logs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          channel_provider: Database["public"]["Enums"]["channel_provider"]
          channel_type: Database["public"]["Enums"]["channel_type"]
          company_id: string
          created_at: string
          default_department_id: string | null
          email_address: string | null
          external_id: string | null
          id: string
          metadata: Json
          name: string
          phone_number: string | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
        }
        Insert: {
          channel_provider?: Database["public"]["Enums"]["channel_provider"]
          channel_type: Database["public"]["Enums"]["channel_type"]
          company_id: string
          created_at?: string
          default_department_id?: string | null
          email_address?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name: string
          phone_number?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
        }
        Update: {
          channel_provider?: Database["public"]["Enums"]["channel_provider"]
          channel_type?: Database["public"]["Enums"]["channel_type"]
          company_id?: string
          created_at?: string
          default_department_id?: string | null
          email_address?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string
          phone_number?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          default_inbox_department_id: string | null
          document: string | null
          email: string | null
          id: string
          is_internal: boolean
          name: string
          phone: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_inbox_department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean
          name: string
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_inbox_department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean
          name?: string
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_default_inbox_department_id_fkey"
            columns: ["default_inbox_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          allow_stalled_takeover: boolean
          company_id: string
          created_at: string
          notify_customer_on_department_transfer: boolean
          protocol_enabled: boolean
          protocol_format: string
          protocol_prefix: string | null
          same_department_only: boolean
          stalled_minutes: number
          updated_at: string
        }
        Insert: {
          allow_stalled_takeover?: boolean
          company_id: string
          created_at?: string
          notify_customer_on_department_transfer?: boolean
          protocol_enabled?: boolean
          protocol_format?: string
          protocol_prefix?: string | null
          same_department_only?: boolean
          stalled_minutes?: number
          updated_at?: string
        }
        Update: {
          allow_stalled_takeover?: boolean
          company_id?: string
          created_at?: string
          notify_customer_on_department_transfer?: boolean
          protocol_enabled?: boolean
          protocol_format?: string
          protocol_prefix?: string | null
          same_department_only?: boolean
          stalled_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          commission_percentage: number
          company_id: string
          created_at: string
          delete_after: string | null
          disabled_at: string | null
          disabled_by: string | null
          disabled_reason: string | null
          id: string
          role: Database["public"]["Enums"]["company_user_role"]
          status: Database["public"]["Enums"]["company_user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_percentage?: number
          company_id: string
          created_at?: string
          delete_after?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          status?: Database["public"]["Enums"]["company_user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_percentage?: number
          company_id?: string
          created_at?: string
          delete_after?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          disabled_reason?: string | null
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          status?: Database["public"]["Enums"]["company_user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_health_snapshots: {
        Row: {
          channel: string
          company_id: string | null
          connection_id: string | null
          created_at: string
          error_count: number
          health: string
          id: string
          identifier: string | null
          instance_name: string | null
          last_activity_at: string | null
          last_error_at: string | null
          metadata: Json
          provider: string
          reconnect_count: number
          source: string
          status: string
        }
        Insert: {
          channel: string
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          error_count?: number
          health?: string
          id?: string
          identifier?: string | null
          instance_name?: string | null
          last_activity_at?: string | null
          last_error_at?: string | null
          metadata?: Json
          provider: string
          reconnect_count?: number
          source?: string
          status?: string
        }
        Update: {
          channel?: string
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          error_count?: number
          health?: string
          id?: string
          identifier?: string | null
          instance_name?: string | null
          last_activity_at?: string | null
          last_error_at?: string | null
          metadata?: Json
          provider?: string
          reconnect_count?: number
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_message_flow_snapshots: {
        Row: {
          channel: string
          channel_id: string | null
          company_id: string | null
          connection_id: string | null
          created_at: string
          failed_count_24h: number
          health: string
          id: string
          identifier: string | null
          inbound_count_24h: number
          instance_name: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_webhook_at: string | null
          metadata: Json
          outbound_count_24h: number
          pending_count_24h: number
          provider: string
          source: string
        }
        Insert: {
          channel: string
          channel_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          failed_count_24h?: number
          health?: string
          id?: string
          identifier?: string | null
          inbound_count_24h?: number
          instance_name?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_webhook_at?: string | null
          metadata?: Json
          outbound_count_24h?: number
          pending_count_24h?: number
          provider: string
          source?: string
        }
        Update: {
          channel?: string
          channel_id?: string | null
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          failed_count_24h?: number
          health?: string
          id?: string
          identifier?: string | null
          inbound_count_24h?: number
          instance_name?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_webhook_at?: string | null
          metadata?: Json
          outbound_count_24h?: number
          pending_count_24h?: number
          provider?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_message_flow_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          metadata: Json
          name: string | null
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      department_users: {
        Row: {
          company_id: string
          created_at: string
          department_id: string
          id: string
          participates_in_rotation: boolean
          role: Database["public"]["Enums"]["department_user_role"]
          status: Database["public"]["Enums"]["department_user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id: string
          id?: string
          participates_in_rotation?: boolean
          role?: Database["public"]["Enums"]["department_user_role"]
          status?: Database["public"]["Enums"]["department_user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string
          id?: string
          participates_in_rotation?: boolean
          role?: Database["public"]["Enums"]["department_user_role"]
          status?: Database["public"]["Enums"]["department_user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          allow_general_queue: boolean
          allow_stalled_takeover: boolean
          assignment_mode: string
          company_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          round_robin_last_user_id: string | null
          status: Database["public"]["Enums"]["department_status"]
          updated_at: string
        }
        Insert: {
          allow_general_queue?: boolean
          allow_stalled_takeover?: boolean
          assignment_mode?: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          round_robin_last_user_id?: string | null
          status?: Database["public"]["Enums"]["department_status"]
          updated_at?: string
        }
        Update: {
          allow_general_queue?: boolean
          allow_stalled_takeover?: boolean
          assignment_mode?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          round_robin_last_user_id?: string | null
          status?: Database["public"]["Enums"]["department_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_round_robin_last_user_id_fkey"
            columns: ["round_robin_last_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_health_snapshots: {
        Row: {
          api_online: boolean
          connected_instances: number
          created_at: string
          disconnected_instances: number
          error_instances: number
          health: string
          id: string
          metadata: Json
          response_time_ms: number | null
          source: string
          total_instances: number
        }
        Insert: {
          api_online?: boolean
          connected_instances?: number
          created_at?: string
          disconnected_instances?: number
          error_instances?: number
          health?: string
          id?: string
          metadata?: Json
          response_time_ms?: number | null
          source?: string
          total_instances?: number
        }
        Update: {
          api_online?: boolean
          connected_instances?: number
          created_at?: string
          disconnected_instances?: number
          error_instances?: number
          health?: string
          id?: string
          metadata?: Json
          response_time_ms?: number | null
          source?: string
          total_instances?: number
        }
        Relationships: []
      }
      infrastructure_health_snapshots: {
        Row: {
          cpu_percent: number | null
          created_at: string
          disk_percent: number | null
          health: string
          id: string
          load_average: number | null
          memory_percent: number | null
          metadata: Json
          response_time_ms: number | null
          source: string
          status: string
          uptime_seconds: number | null
        }
        Insert: {
          cpu_percent?: number | null
          created_at?: string
          disk_percent?: number | null
          health?: string
          id?: string
          load_average?: number | null
          memory_percent?: number | null
          metadata?: Json
          response_time_ms?: number | null
          source?: string
          status?: string
          uptime_seconds?: number | null
        }
        Update: {
          cpu_percent?: number | null
          created_at?: string
          disk_percent?: number | null
          health?: string
          id?: string
          load_average?: number | null
          memory_percent?: number | null
          metadata?: Json
          response_time_ms?: number | null
          source?: string
          status?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      kanban_cards: {
        Row: {
          assigned_user_id: string | null
          card_type: Database["public"]["Enums"]["kanban_card_type"]
          column_id: string
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          lane_id: string
          opportunity_id: string | null
          position: number
          task_id: string | null
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          card_type?: Database["public"]["Enums"]["kanban_card_type"]
          column_id: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          lane_id: string
          opportunity_id?: string | null
          position?: number
          task_id?: string | null
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          card_type?: Database["public"]["Enums"]["kanban_card_type"]
          column_id?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          lane_id?: string
          opportunity_id?: string | null
          position?: number
          task_id?: string | null
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "kanban_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          color: string | null
          column_type: string | null
          commercial_action: string | null
          commercial_action_enabled: boolean
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          lane_id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          column_type?: string | null
          commercial_action?: string | null
          commercial_action_enabled?: boolean
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lane_id: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          column_type?: string | null
          commercial_action?: string | null
          commercial_action_enabled?: boolean
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lane_id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_columns_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "kanban_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_lanes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          id: string
          is_active: boolean
          is_personal: boolean
          lane_type: Database["public"]["Enums"]["kanban_lane_type"]
          name: string
          operational_enabled: boolean
          owner_user_id: string | null
          position: number
          return_if_unassigned: boolean
          return_target: string | null
          return_timeout_minutes: number | null
          transfer_ticket_on_drop: boolean
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          lane_type?: Database["public"]["Enums"]["kanban_lane_type"]
          name: string
          operational_enabled?: boolean
          owner_user_id?: string | null
          position?: number
          return_if_unassigned?: boolean
          return_target?: string | null
          return_timeout_minutes?: number | null
          transfer_ticket_on_drop?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          lane_type?: Database["public"]["Enums"]["kanban_lane_type"]
          name?: string
          operational_enabled?: boolean
          owner_user_id?: string | null
          position?: number
          return_if_unassigned?: boolean
          return_target?: string | null
          return_timeout_minutes?: number | null
          transfer_ticket_on_drop?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_lanes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_lanes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      message_favorites: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message_id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message_id: string
          ticket_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message_id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_favorites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_favorites_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_favorites_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          company_id: string
          created_at: string
          emoji: string
          external_reaction_id: string | null
          external_sender: string | null
          id: string
          message_id: string
          source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          emoji: string
          external_reaction_id?: string | null
          external_sender?: string | null
          id?: string
          message_id: string
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          emoji?: string
          external_reaction_id?: string | null
          external_sender?: string | null
          id?: string
          message_id?: string
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          delivery_status: string
          direction: Database["public"]["Enums"]["message_direction"]
          edited_at: string | null
          external_id: string | null
          failed_at: string | null
          failure_reason: string | null
          from_me: boolean
          id: string
          is_edited: boolean
          media_caption: string | null
          media_duration: number | null
          media_file_name: string | null
          media_mime_type: string | null
          media_provider_id: string | null
          media_size: number | null
          media_storage_path: string | null
          media_url: string | null
          msg_type: Database["public"]["Enums"]["message_type"]
          original_body: string | null
          provider_message_id: string | null
          raw: Json
          raw_body: string | null
          read_at: string | null
          reply_to_message_id: string | null
          reply_to_message_type: string | null
          reply_to_preview: string | null
          reply_to_provider_message_id: string | null
          reply_to_sender_name: string | null
          sent_at: string
          sent_by_name: string | null
          sent_by_signature: string | null
          sent_by_user_id: string | null
          source: string
          status: string | null
          ticket_id: string
        }
        Insert: {
          body?: string | null
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction: Database["public"]["Enums"]["message_direction"]
          edited_at?: string | null
          external_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          from_me?: boolean
          id?: string
          is_edited?: boolean
          media_caption?: string | null
          media_duration?: number | null
          media_file_name?: string | null
          media_mime_type?: string | null
          media_provider_id?: string | null
          media_size?: number | null
          media_storage_path?: string | null
          media_url?: string | null
          msg_type?: Database["public"]["Enums"]["message_type"]
          original_body?: string | null
          provider_message_id?: string | null
          raw?: Json
          raw_body?: string | null
          read_at?: string | null
          reply_to_message_id?: string | null
          reply_to_message_type?: string | null
          reply_to_preview?: string | null
          reply_to_provider_message_id?: string | null
          reply_to_sender_name?: string | null
          sent_at?: string
          sent_by_name?: string | null
          sent_by_signature?: string | null
          sent_by_user_id?: string | null
          source?: string
          status?: string | null
          ticket_id: string
        }
        Update: {
          body?: string | null
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          edited_at?: string | null
          external_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          from_me?: boolean
          id?: string
          is_edited?: boolean
          media_caption?: string | null
          media_duration?: number | null
          media_file_name?: string | null
          media_mime_type?: string | null
          media_provider_id?: string | null
          media_size?: number | null
          media_storage_path?: string | null
          media_url?: string | null
          msg_type?: Database["public"]["Enums"]["message_type"]
          original_body?: string | null
          provider_message_id?: string | null
          raw?: Json
          raw_body?: string | null
          read_at?: string | null
          reply_to_message_id?: string | null
          reply_to_message_type?: string | null
          reply_to_preview?: string | null
          reply_to_provider_message_id?: string | null
          reply_to_sender_name?: string | null
          sent_at?: string
          sent_by_name?: string | null
          sent_by_signature?: string | null
          sent_by_user_id?: string | null
          source?: string
          status?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_events: {
        Row: {
          channel: string | null
          company_id: string | null
          connection_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json
          provider: string | null
          severity: string
          source: string
          title: string
        }
        Insert: {
          channel?: string | null
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json
          provider?: string | null
          severity?: string
          source?: string
          title: string
        }
        Update: {
          channel?: string | null
          company_id?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          provider?: string | null
          severity?: string
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number | null
          assigned_user_id: string | null
          closed_at: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          department_id: string | null
          id: string
          notes: string | null
          source: string | null
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_user_id?: string | null
          closed_at?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          department_id?: string | null
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_user_id?: string | null
          closed_at?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          department_id?: string | null
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message_id: string
          pinned_by: string
          ticket_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message_id: string
          pinned_by: string
          ticket_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message_id?: string
          pinned_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_tickets: {
        Row: {
          company_id: string
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          global_role: Database["public"]["Enums"]["global_role"]
          id: string
          is_master: boolean
          must_change_password: boolean
          password_changed_at: string | null
          phone: string | null
          public_name: string | null
          signature: string | null
          signature_enabled: boolean
          temporary_password_set_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id: string
          is_master?: boolean
          must_change_password?: boolean
          password_changed_at?: string | null
          phone?: string | null
          public_name?: string | null
          signature?: string | null
          signature_enabled?: boolean
          temporary_password_set_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id?: string
          is_master?: boolean
          must_change_password?: boolean
          password_changed_at?: string | null
          phone?: string | null
          public_name?: string | null
          signature?: string | null
          signature_enabled?: boolean
          temporary_password_set_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          body: string
          category: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          shortcut: string | null
          title: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          body: string
          category?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          shortcut?: string | null
          title: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          body?: string
          category?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          shortcut?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_commissions: {
        Row: {
          commission_amount: number
          commission_percentage: number
          company_id: string
          contact_id: string | null
          created_at: string
          deleted_at: string | null
          generated_at: string
          id: string
          opportunity_amount: number
          opportunity_id: string
          paid_at: string | null
          seller_user_id: string
          status: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          commission_amount: number
          commission_percentage: number
          company_id: string
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          generated_at?: string
          id?: string
          opportunity_amount: number
          opportunity_id: string
          paid_at?: string | null
          seller_user_id: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          commission_percentage?: number
          company_id?: string
          contact_id?: string | null
          created_at?: string
          deleted_at?: string | null
          generated_at?: string
          id?: string
          opportunity_amount?: number
          opportunity_id?: string
          paid_at?: string | null
          seller_user_id?: string
          status?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_commissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commissions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_events: {
        Row: {
          assigned_user_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          channel_id: string | null
          channel_type: Database["public"]["Enums"]["channel_type"] | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          end_at: string | null
          id: string
          location: string | null
          meeting_enabled: boolean
          meeting_url: string | null
          reminder_1h_enabled: boolean
          reminder_5m_enabled: boolean
          send_confirmation: boolean
          start_at: string
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_enabled?: boolean
          meeting_url?: string | null
          reminder_1h_enabled?: boolean
          reminder_5m_enabled?: boolean
          send_confirmation?: boolean
          start_at: string
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          meeting_enabled?: boolean
          meeting_url?: string | null
          reminder_1h_enabled?: boolean
          reminder_5m_enabled?: boolean
          send_confirmation?: boolean
          start_at?: string
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          body: string
          channel_id: string | null
          channel_type: Database["public"]["Enums"]["channel_type"] | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          scheduled_for: string
          sent_at: string | null
          status: string
          ticket_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          body: string
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "scheduled_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_automation_jobs: {
        Row: {
          attempts: number
          automation_id: string
          company_id: string
          created_at: string
          created_by: string | null
          entity_type: string
          error_message: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          run_after: string
          started_at: string | null
          status: string
          tag_id: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          automation_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          run_after?: string
          started_at?: string | null
          status?: string
          tag_id: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          automation_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          run_after?: string
          started_at?: string | null
          status?: string
          tag_id?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_automation_jobs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "tag_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automation_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automation_jobs_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automation_jobs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_automations: {
        Row: {
          action_type: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_type: string
          event_type: string
          id: string
          is_active: boolean
          name: string | null
          tag_id: string
          target_kanban_column_id: string | null
          target_kanban_lane_id: string | null
          updated_at: string
        }
        Insert: {
          action_type?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          tag_id: string
          target_kanban_column_id?: string | null
          target_kanban_lane_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          tag_id?: string
          target_kanban_column_id?: string | null
          target_kanban_lane_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_automations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_target_kanban_column_id_fkey"
            columns: ["target_kanban_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_automations_target_kanban_lane_id_fkey"
            columns: ["target_kanban_lane_id"]
            isOneToOne: false
            referencedRelation: "kanban_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_links: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_type: string
          id: string
          opportunity_id: string | null
          tag_id: string
          ticket_id: string | null
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type: string
          id?: string
          opportunity_id?: string | null
          tag_id: string
          ticket_id?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          id?: string
          opportunity_id?: string | null
          tag_id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_links_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_protocol_sequences: {
        Row: {
          company_id: string
          current_value: number
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          current_value?: number
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          current_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_protocol_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_transfers: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          company_id: string
          created_at: string
          from_department_id: string | null
          from_user_id: string | null
          id: string
          kanban_card_id: string | null
          kanban_column_id: string | null
          kanban_lane_id: string | null
          return_deadline_at: string | null
          return_if_unassigned: boolean
          return_target: string | null
          return_timeout_minutes: number | null
          returned_at: string | null
          returned_to_user_id: string | null
          source: string
          status: string
          ticket_id: string
          to_department_id: string
          transferred_by: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id: string
          created_at?: string
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          kanban_card_id?: string | null
          kanban_column_id?: string | null
          kanban_lane_id?: string | null
          return_deadline_at?: string | null
          return_if_unassigned?: boolean
          return_target?: string | null
          return_timeout_minutes?: number | null
          returned_at?: string | null
          returned_to_user_id?: string | null
          source?: string
          status?: string
          ticket_id: string
          to_department_id: string
          transferred_by?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          company_id?: string
          created_at?: string
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          kanban_card_id?: string | null
          kanban_column_id?: string | null
          kanban_lane_id?: string | null
          return_deadline_at?: string | null
          return_if_unassigned?: boolean
          return_target?: string | null
          return_timeout_minutes?: number | null
          returned_at?: string | null
          returned_to_user_id?: string | null
          source?: string
          status?: string
          ticket_id?: string
          to_department_id?: string
          transferred_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_kanban_card_id_fkey"
            columns: ["kanban_card_id"]
            isOneToOne: false
            referencedRelation: "kanban_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_kanban_column_id_fkey"
            columns: ["kanban_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_kanban_lane_id_fkey"
            columns: ["kanban_lane_id"]
            isOneToOne: false
            referencedRelation: "kanban_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_user_id: string | null
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          department_id: string | null
          id: string
          last_message_at: string | null
          metadata: Json
          protocol_number: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_user_id?: string | null
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          protocol_number?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_user_id?: string | null
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_message_at?: string | null
          metadata?: Json
          protocol_number?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          channel_id: string
          company_id: string
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          events_configured: boolean
          id: string
          instance_name: string
          last_settings_sync_at: string | null
          last_webhook_at: string | null
          phone_number: string | null
          qr_code: string | null
          settings_sync_error: string | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          webhook_configured: boolean
        }
        Insert: {
          channel_id: string
          company_id: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          events_configured?: boolean
          id?: string
          instance_name: string
          last_settings_sync_at?: string | null
          last_webhook_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          settings_sync_error?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_configured?: boolean
        }
        Update: {
          channel_id?: string
          company_id?: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          events_configured?: boolean
          id?: string
          instance_name?: string
          last_settings_sync_at?: string | null
          last_webhook_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          settings_sync_error?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          webhook_configured?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _k10_can_manage_company: {
        Args: { _company_id: string; _uid: string }
        Returns: boolean
      }
      _k10_check_lane_access: {
        Args: {
          _company_id: string
          _lane: Database["public"]["Tables"]["kanban_lanes"]["Row"]
          _uid: string
        }
        Returns: undefined
      }
      _tags_can_access_entity: {
        Args: {
          _company_id: string
          _contact_id: string
          _entity_type: string
          _opportunity_id: string
          _ticket_id: string
          _uid: string
        }
        Returns: boolean
      }
      _tags_can_manage: {
        Args: { _company_id: string; _uid: string }
        Returns: boolean
      }
      apply_tag_to_entity: {
        Args: {
          _company_id: string
          _contact_id?: string
          _entity_type: string
          _opportunity_id?: string
          _tag_id: string
          _ticket_id?: string
        }
        Returns: string
      }
      archive_kanban_card: {
        Args: { _card_id: string; _company_id: string }
        Returns: undefined
      }
      archive_kanban_column: {
        Args: { _column_id: string; _company_id: string }
        Returns: undefined
      }
      archive_kanban_lane: {
        Args: { _company_id: string; _lane_id: string }
        Returns: undefined
      }
      connection_health_cleanup: { Args: never; Returns: undefined }
      connection_message_flow_cleanup: { Args: never; Returns: undefined }
      create_opportunity_from_kanban: {
        Args: {
          _amount: number
          _assigned_user_id: string
          _company_id: string
          _kanban_card_id: string
          _notes: string
          _status: string
          _target_column_id: string
          _target_lane_id: string
          _title: string
        }
        Returns: {
          new_card_id: string
          opportunity_id: string
          status: string
        }[]
      }
      evolution_health_cleanup: { Args: never; Returns: undefined }
      generate_ticket_protocol: {
        Args: { _company_id: string }
        Returns: string
      }
      get_monitoring_cron_secret: { Args: never; Returns: string }
      has_schedule_conflict: {
        Args: {
          p_assigned_user_id: string
          p_company_id: string
          p_end_at: string
          p_ignore_event_id?: string
          p_start_at: string
        }
        Returns: boolean
      }
      is_master: { Args: { _user_id: string }; Returns: boolean }
      master_connection_aggregates: {
        Args: { _days: number; _limit?: number }
        Returns: {
          channel: string
          company_id: string
          connection_id: string
          error_count: number
          identifier: string
          instance_name: string
          last_event_at: string
          offline_count: number
          provider: string
          total_snapshots: number
        }[]
      }
      master_evolution_aggregates: {
        Args: { _days: number }
        Returns: {
          avg_connected: number
          avg_disconnected: number
          avg_latency_ms: number
          max_latency_ms: number
          min_latency_ms: number
          offline_snapshots: number
          online_pct: number
          online_snapshots: number
          total_errors: number
          total_snapshots: number
        }[]
      }
      master_flow_aggregates: {
        Args: { _days: number }
        Returns: {
          total_failed: number
          total_inbound: number
          total_outbound: number
          total_pending: number
        }[]
      }
      master_message_flow_24h: {
        Args: never
        Returns: {
          channel_id: string
          failed_24h: number
          inbound_24h: number
          last_inbound_at: string
          last_outbound_at: string
          outbound_24h: number
          pending_24h: number
        }[]
      }
      master_vps_aggregates: {
        Args: { _days: number }
        Returns: {
          avg_cpu: number
          avg_disk: number
          avg_memory: number
          critical_snapshots: number
          healthy_pct: number
          healthy_snapshots: number
          max_cpu: number
          max_disk: number
          max_memory: number
          total_snapshots: number
        }[]
      }
      monitoring_events_cleanup: { Args: never; Returns: undefined }
      monitoring_events_log: {
        Args: {
          _channel: string
          _company_id: string
          _connection_id: string
          _description: string
          _event_type: string
          _metadata: Json
          _provider: string
          _severity: string
          _source: string
          _title: string
        }
        Returns: string
      }
      pick_next_round_robin_user: {
        Args: { _company_id: string; _department_id: string }
        Returns: {
          assigned_user_id: string
          assigned_user_name: string
          assignment_mode: string
          department_id: string
          reason: string
        }[]
      }
      process_due_ticket_transfer_returns: {
        Args: { _limit?: number }
        Returns: {
          accepted: number
          processed: number
          returned: number
          skipped: number
        }[]
      }
      process_tag_automation_jobs: {
        Args: { _limit?: number; _worker?: string }
        Returns: {
          done: number
          failed: number
          processed: number
          skipped: number
        }[]
      }
      release_kanban_returns_cron_lock: { Args: never; Returns: boolean }
      release_monitoring_cron_lock: { Args: never; Returns: boolean }
      remove_tag_from_entity: {
        Args: {
          _company_id: string
          _contact_id?: string
          _entity_type: string
          _opportunity_id?: string
          _tag_id: string
          _ticket_id?: string
        }
        Returns: undefined
      }
      reorder_kanban_card: {
        Args: { _card_id: string; _company_id: string; _direction: string }
        Returns: undefined
      }
      reorder_kanban_card_to_position: {
        Args: { _card_id: string; _company_id: string; _new_index: number }
        Returns: undefined
      }
      reorder_kanban_column: {
        Args: { _column_id: string; _company_id: string; _direction: string }
        Returns: undefined
      }
      reorder_kanban_lane: {
        Args: { _company_id: string; _direction: string; _lane_id: string }
        Returns: undefined
      }
      transfer_ticket_to_department_from_kanban: {
        Args: {
          _company_id: string
          _kanban_card_id: string
          _kanban_column_id: string
          _kanban_lane_id: string
          _target_department_id: string
          _ticket_id: string
        }
        Returns: {
          status: string
          transfer_id: string
        }[]
      }
      try_kanban_returns_cron_lock: { Args: never; Returns: boolean }
      try_monitoring_cron_lock: { Args: never; Returns: boolean }
      update_commission_status: {
        Args: { _action: string; _commission_id: string }
        Returns: {
          commission_amount: number
          commission_percentage: number
          company_id: string
          contact_id: string | null
          created_at: string
          deleted_at: string | null
          generated_at: string
          id: string
          opportunity_amount: number
          opportunity_id: string
          paid_at: string | null
          seller_user_id: string
          status: string
          ticket_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_commissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_kanban_manual_card: {
        Args: {
          _assigned_user_id: string
          _card_id: string
          _company_id: string
          _description: string
          _title: string
        }
        Returns: undefined
      }
      update_opportunity_status_from_kanban: {
        Args: {
          _company_id: string
          _kanban_card_id: string
          _kanban_column_id: string
          _kanban_lane_id: string
          _opportunity_id: string
        }
        Returns: {
          new_status: string
          old_status: string
          opportunity_id: string
          status: string
        }[]
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      user_company_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["company_user_role"]
      }
    }
    Enums: {
      channel_provider: "evolution" | "evogo" | "meta" | "imap_smtp" | "manual"
      channel_status:
        | "disconnected"
        | "pending"
        | "connected"
        | "error"
        | "disabled"
      channel_type: "whatsapp" | "instagram" | "facebook" | "email"
      company_status: "trial" | "active" | "pending" | "suspended" | "canceled"
      company_user_role: "owner" | "admin" | "manager" | "agent" | "financial"
      company_user_status: "active" | "pending" | "disabled"
      department_status: "active" | "inactive"
      department_user_role: "manager" | "agent" | "viewer"
      department_user_status: "active" | "inactive"
      global_role: "master" | "user"
      kanban_card_type: "manual" | "ticket" | "contact" | "opportunity" | "task"
      kanban_lane_type: "department" | "commercial" | "personal" | "custom"
      message_direction: "inbound" | "outbound"
      message_type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "document"
        | "sticker"
        | "location"
        | "contact"
        | "other"
        | "system"
      ticket_status: "open" | "pending" | "closed"
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
      channel_provider: ["evolution", "evogo", "meta", "imap_smtp", "manual"],
      channel_status: [
        "disconnected",
        "pending",
        "connected",
        "error",
        "disabled",
      ],
      channel_type: ["whatsapp", "instagram", "facebook", "email"],
      company_status: ["trial", "active", "pending", "suspended", "canceled"],
      company_user_role: ["owner", "admin", "manager", "agent", "financial"],
      company_user_status: ["active", "pending", "disabled"],
      department_status: ["active", "inactive"],
      department_user_role: ["manager", "agent", "viewer"],
      department_user_status: ["active", "inactive"],
      global_role: ["master", "user"],
      kanban_card_type: ["manual", "ticket", "contact", "opportunity", "task"],
      kanban_lane_type: ["department", "commercial", "personal", "custom"],
      message_direction: ["inbound", "outbound"],
      message_type: [
        "text",
        "image",
        "audio",
        "video",
        "document",
        "sticker",
        "location",
        "contact",
        "other",
        "system",
      ],
      ticket_status: ["open", "pending", "closed"],
    },
  },
} as const
