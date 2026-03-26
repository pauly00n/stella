import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthenticatedUserResult =
  | { supabase: ServerSupabaseClient; user: User }
  | { supabase: ServerSupabaseClient; user: null };

export async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}

