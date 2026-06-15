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
        ]
      }
      companies: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_user_role"]
          status: Database["public"]["Enums"]["company_user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          status?: Database["public"]["Enums"]["company_user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
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
      messages: {
        Row: {
          body: string | null
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          from_me: boolean
          id: string
          media_url: string | null
          msg_type: Database["public"]["Enums"]["message_type"]
          raw: Json
          sent_at: string
          status: string | null
          ticket_id: string
        }
        Insert: {
          body?: string | null
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          from_me?: boolean
          id?: string
          media_url?: string | null
          msg_type?: Database["public"]["Enums"]["message_type"]
          raw?: Json
          sent_at?: string
          status?: string | null
          ticket_id: string
        }
        Update: {
          body?: string | null
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          from_me?: boolean
          id?: string
          media_url?: string | null
          msg_type?: Database["public"]["Enums"]["message_type"]
          raw?: Json
          sent_at?: string
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
            foreignKeyName: "messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
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
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          assigned_user_id: string | null
          channel_id: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          last_message_at: string | null
          metadata: Json
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          channel_id?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          channel_id?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
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
        ]
      }
      whatsapp_instances: {
        Row: {
          channel_id: string
          company_id: string
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          instance_name: string
          phone_number: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
        }
        Insert: {
          channel_id: string
          company_id: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          instance_name: string
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
        }
        Update: {
          channel_id?: string
          company_id?: string
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          instance_name?: string
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
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
      is_master: { Args: { _user_id: string }; Returns: boolean }
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
      global_role: "master" | "user"
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
      global_role: ["master", "user"],
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
      ],
      ticket_status: ["open", "pending", "closed"],
    },
  },
} as const
