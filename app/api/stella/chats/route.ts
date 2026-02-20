import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CreateChatBodySchema,
  type TaskType,
  type DefaultTask,
} from "@/lib/schemas/chat";
import { createRequestLogger } from "@/lib/observability/logger";

function mapTaskToDefaultTask(task: TaskType): DefaultTask {
  const taskMap: Record<TaskType, DefaultTask> = {
    Auto: "auto",
    "Refine draft report": "refine",
    "Differential diagnostic": "diagnostic",
  };
  return taskMap[task];
}

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

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats",
    method: "GET",
  });

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not authenticated" }, { status: 401 });
  }

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
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: "/api/stella/chats",
    method: "POST",
  });

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

  const parsed = CreateChatBodySchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid messageContent or task" },
      { status: 400 },
    );
  }

  const { messageContent, task } = parsed.data;
  const defaultTask = mapTaskToDefaultTask(task);

  const { data: chatData, error: chatError } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      default_task: defaultTask,
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
