import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRequestLogger } from "@/lib/observability/logger";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null as null };
  }
  return { supabase, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatID: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats/[chatID]/messages",
    method: "GET",
  });

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
  }

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
