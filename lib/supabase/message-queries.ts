import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Builds a query to fetch the latest assistant message in a chat.
 * If `messageId` is provided, the result is pinned to that message.
 */
export function fetchLatestAssistantMessageForChat(
  supabase: SupabaseClient,
  params: { chatId: string; userId: string; messageId?: string },
) {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("chat_id", params.chatId)
    .eq("user_id", params.userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.messageId) {
    query = query.eq("message_id", params.messageId);
  }

  return query;
}

