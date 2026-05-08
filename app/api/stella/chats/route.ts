import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import {
  CreateChatBodySchema,
  type TaskType,
  type DefaultTask,
} from "@/lib/schemas/chat";
import {
  buildRouteContext,
  parseJsonBody,
  unauthorizedResponse,
} from "@/lib/api/route-helpers";

const TASK_TO_DEFAULT: Record<TaskType, DefaultTask> = {
  Auto: "auto",
  Tumor: "tumor",
  Arthritis: "arthritis",
  Trauma: "trauma",
  Infection: "infection",
  AVN: "avn",
  Inflammatory: "inflammatory",
  Developmental: "developmental",
  Vascular: "vascular",
};

export async function GET(request: NextRequest) {
  const { logger } = buildRouteContext(request, "/api/stella/chats", "GET");

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("chats.list_failed", error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "Failed to load chats" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chats: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { logger } = buildRouteContext(request, "/api/stella/chats", "POST");

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await parseJsonBody(request, CreateChatBodySchema);
  if (body.error) return body.error;

  const { messageContent, task } = body.data;

  const { data: chatData, error: chatError } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      default_task: TASK_TO_DEFAULT[task],
    })
    .select("*")
    .single();

  if (chatError || !chatData) {
    logger.error("chats.create_failed", chatError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "Failed to create chat" }, { status: 500 });
  }

  const { data: messageData, error: messageError } = await supabase
    .from("messages")
    .insert({
      chat_id: chatData.chat_id,
      user_id: user.id,
      role: "user",
      content: messageContent,
    })
    .select("*")
    .single();

  if (messageError || !messageData) {
    logger.error("messages.create_initial_failed", messageError, {
      userId: user.id,
      chatId: chatData.chat_id,
    });
    // Best-effort cleanup to avoid orphan chat rows.
    await supabase.from("chats").delete().eq("chat_id", chatData.chat_id).eq("user_id", user.id);
    return NextResponse.json({ ok: false, error: "Failed to create message" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chat: chatData, message: messageData });
}
