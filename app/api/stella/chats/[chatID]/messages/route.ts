import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { buildRouteContext, unauthorizedResponse } from "@/lib/api/route-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatID: string }> },
) {
  const { logger } = buildRouteContext(request, "/api/stella/chats/[chatID]/messages", "GET");

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatID)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("messages.list_failed", error, { userId: user.id, chatId: chatID });
    return NextResponse.json({ ok: false, error: "Failed to load messages" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data ?? [] });
}
