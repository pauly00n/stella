import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { UpdateChatTitleBodySchema } from "@/lib/schemas/chat";
import { createRequestLogger } from "@/lib/observability/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatID: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats/[chatID]",
    method: "GET",
  });

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("chat_id", chatID)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    logger.error("chat.get_failed", error, { userId: user.id, chatId: chatID });
    return NextResponse.json({ ok: false, error: "Failed to load chat" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, chat: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatID: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats/[chatID]",
    method: "PATCH",
  });

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
  }

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateChatTitleBodySchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 });
  }
  const { title } = parsed.data;

  const { data, error } = await supabase
    .from("chats")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("chat_id", chatID)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    logger.error("chat.update_title_failed", error, { userId: user.id, chatId: chatID });
    return NextResponse.json({ ok: false, error: "Failed to update chat title" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatID: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats/[chatID]",
    method: "DELETE",
  });

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
  }

  // Relies on ON DELETE CASCADE on the messages.chat_id FK
  const { error } = await supabase
    .from("chats")
    .delete()
    .eq("chat_id", chatID)
    .eq("user_id", user.id);

  if (error) {
    logger.error("chat.delete_failed", error, { userId: user.id, chatId: chatID });
    return NextResponse.json({ ok: false, error: "Failed to delete chat" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
