import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { UpdateChatTitleBodySchema } from "@/lib/schemas/chat";
import {
  buildRouteContext,
  parseJsonBody,
  unauthorizedResponse,
} from "@/lib/api/route-helpers";

type Params = { params: Promise<{ chatID: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { logger } = buildRouteContext(request, "/api/stella/chats/[chatID]", "GET");

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

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

export async function PATCH(request: NextRequest, { params }: Params) {
  const { logger } = buildRouteContext(request, "/api/stella/chats/[chatID]", "PATCH");

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await parseJsonBody(request, UpdateChatTitleBodySchema);
  if (body.error) return body.error;

  const { data, error } = await supabase
    .from("chats")
    .update({ title: body.data.title, updated_at: new Date().toISOString() })
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

export async function DELETE(request: NextRequest, { params }: Params) {
  const { logger } = buildRouteContext(request, "/api/stella/chats/[chatID]", "DELETE");

  const { chatID } = await params;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

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
