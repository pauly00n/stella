/**
 * Database types for Supabase tables
 * 
 * This file should be updated to match your actual database schema.
 * You can generate types automatically using Supabase CLI:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      // TODO: Add your table definitions here
      // Example:
      // table_name: {
      //   Row: {
      //     id: string
      //     created_at: string
      //     // ... other columns
      //   }
      //   Insert: {
      //     id?: string
      //     created_at?: string
      //     // ... other columns
      //   }
      //   Update: {
      //     id?: string
      //     created_at?: string
      //     // ... other columns
      //   }
      // }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

