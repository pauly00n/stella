export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import {
  streamGeminiReport,
  selectTaskForAutoMode,
} from '@/lib/services/generate-service';
import {
  GenerateForChatBodySchema,
  MessageMetaSchema,
  type InternalTask,
} from '@/lib/schemas/chat';
import { serverEnv } from '@/lib/env/server';
import {
  buildRouteContext,
  enforceRateLimit,
  parseJsonBody,
  unauthorizedResponse,
} from '@/lib/api/route-helpers';

interface AssistantMessageMeta {
  status: 'analyzing_task' | 'generating' | 'complete';
  images: never[];
  task: InternalTask | null;
  latencyMs: number;
  showImages: boolean;
  idempotencyKey?: string;
}

/**
 * Writes an assistant message — either by updating a pre-inserted placeholder
 * or by inserting a fresh row when the placeholder was never created.
 * Returns the resulting message_id, or null on failure.
 */
async function writeAssistantMessage(
  supabase: SupabaseClient,
  args: {
    chatId: string;
    userId: string;
    placeholderMessageId: string | null;
    content: string;
    meta: AssistantMessageMeta;
  },
): Promise<{ messageId: string | null; error: unknown }> {
  if (args.placeholderMessageId) {
    const { data, error } = await supabase
      .from('messages')
      .update({ content: args.content, meta: args.meta })
      .eq('message_id', args.placeholderMessageId)
      .eq('user_id', args.userId)
      .select('message_id')
      .single();
    return { messageId: data?.message_id ?? null, error };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: args.chatId,
      user_id: args.userId,
      role: 'assistant',
      content: args.content,
      meta: args.meta,
    })
    .select('message_id')
    .single();
  return { messageId: data?.message_id ?? null, error };
}

export async function POST(request: NextRequest) {
  const { logger, clientIp } = buildRouteContext(request, '/api/stella/generate/response');

  try {
    const body = await parseJsonBody(request, GenerateForChatBodySchema);
    if (body.error) return body.error;

    const { chatId, draft, mode, showImages = false, idempotencyKey } = body.data;

    if (!chatId || !draft?.trim() || !mode) {
      return NextResponse.json({ ok: false, error: 'Missing chatId, draft, or mode' }, { status: 400 });
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    const limit = Number(serverEnv.RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE) || 20;
    const rateLimited = await enforceRateLimit({
      scope: 'generate:response',
      identifier: user.id || clientIp,
      limit,
      logger,
      logEvent: 'generate.response.rate_limited',
    });
    if (rateLimited) return rateLimited;

    // Idempotency guard — return the prior result if this exact key already produced one.
    if (idempotencyKey) {
      const { data: existingMessages, error: existingError } = await supabase
        .from('messages')
        .select('message_id, meta')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .eq('role', 'assistant')
        .contains('meta', { idempotencyKey })
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingError) {
        logger.error('generate.response.idempotency_lookup_failed', existingError, { chatId, userId: user.id, idempotencyKey });
      } else if (existingMessages && existingMessages.length > 0) {
        const existing = existingMessages[0];
        const parsedMeta = MessageMetaSchema.safeParse(existing.meta);
        return NextResponse.json({
          ok: true,
          task: parsedMeta.success ? parsedMeta.data.task ?? null : null,
          latencyMs: parsedMeta.success && typeof parsedMeta.data.latencyMs === 'number' ? parsedMeta.data.latencyMs : 0,
          messageId: existing.message_id,
          idempotent: true,
        });
      }
    }

    const start = Date.now();

    // Resolve task: explicit UI mode bypasses Gemini classification.
    const autoTask: InternalTask | null = mode === 'Auto' ? await selectTaskForAutoMode(draft) : null;
    const task: InternalTask = mode === 'Auto' ? (autoTask ?? 'none') : 'diagnostic';
    const initialStatus: AssistantMessageMeta['status'] = mode === 'Auto' ? 'analyzing_task' : 'generating';

    const { data: placeholderData, error: placeholderError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        user_id: user.id,
        role: 'assistant',
        content: '',
        meta: {
          status: initialStatus,
          images: [],
          task: mode === 'Auto' ? null : task,
          latencyMs: 0,
          showImages,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      })
      .select('message_id')
      .single();

    let placeholderMessageId: string | null = null;
    if (placeholderError) {
      logger.error('generate.response.placeholder_insert_failed', placeholderError, { chatId, userId: user.id, task });
    } else {
      placeholderMessageId = placeholderData.message_id;

      // For Auto mode, transition the placeholder from "analyzing" to "generating"
      // so the UI's thinking-phase indicator advances before streaming begins.
      if (mode === 'Auto' && autoTask) {
        await supabase
          .from('messages')
          .update({
            meta: {
              status: 'generating',
              images: [],
              task: autoTask,
              latencyMs: Date.now() - start,
              showImages,
              ...(idempotencyKey ? { idempotencyKey } : {}),
            },
          })
          .eq('message_id', placeholderMessageId)
          .eq('user_id', user.id);
      }
    }

    const buildFinalMeta = (latencyMs: number): AssistantMessageMeta => ({
      status: 'complete',
      images: [],
      task,
      latencyMs,
      showImages,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    // task === 'none': static response, no streaming needed.
    if (task === 'none') {
      const resultText =
        'The description does not appear to be a radiology or clinical imaging finding. Please describe imaging features, mass characteristics, or clinical findings.';
      const noneLatencyMs = Date.now() - start;

      const { messageId, error } = await writeAssistantMessage(supabase, {
        chatId,
        userId: user.id,
        placeholderMessageId,
        content: resultText,
        meta: buildFinalMeta(noneLatencyMs),
      });

      if (error) {
        logger.error('generate.response.none_persist_failed', error, { chatId, userId: user.id });
        return NextResponse.json({ ok: false, error: 'Failed to save assistant message' }, { status: 500 });
      }

      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', user.id);
      return NextResponse.json({ ok: true, task, latencyMs: noneLatencyMs, messageId });
    }

    // task === 'diagnostic': stream Gemini response via SSE.
    const encoder = new TextEncoder();
    const queue: Uint8Array[] = [];
    let streamDone = false;
    const notifier = { notify: null as null | (() => void) };

    const readable = new ReadableStream({
      async pull(controller) {
        while (queue.length === 0 && !streamDone) {
          await new Promise<void>((resolve) => { notifier.notify = resolve; });
        }
        if (queue.length > 0) {
          controller.enqueue(queue.shift()!);
        } else {
          controller.close();
        }
      },
    });

    const send = (obj: Record<string, unknown>) => {
      queue.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      if (notifier.notify) { notifier.notify(); notifier.notify = null; }
    };

    const closeStream = () => {
      streamDone = true;
      if (notifier.notify) { notifier.notify(); notifier.notify = null; }
    };

    (async () => {
      try {
        send({ placeholderMessageId });

        let fullText = '';
        try {
          for await (const chunk of streamGeminiReport({ draft, differentialBias: mode })) {
            fullText += chunk;
            send({ chunk });
          }
        } catch (streamErr) {
          logger.error('generate.response.stream_failed', streamErr, { chatId, userId: user.id });
          if (placeholderMessageId) {
            await supabase.from('messages').delete().eq('message_id', placeholderMessageId).eq('user_id', user.id);
          }
          send({ error: 'Streaming generation failed' });
          closeStream();
          return;
        }

        const textLatencyMs = Date.now() - start;
        const { messageId, error: persistError } = await writeAssistantMessage(supabase, {
          chatId,
          userId: user.id,
          placeholderMessageId,
          content: fullText,
          meta: buildFinalMeta(textLatencyMs),
        });

        if (persistError) {
          logger.error('generate.response.persist_failed', persistError, { chatId, userId: user.id });
          send({ error: 'Failed to persist generated message' });
          closeStream();
          return;
        }

        await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', user.id);
        send({ done: true, task, latencyMs: textLatencyMs, messageId });
        closeStream();
      } catch (err) {
        logger.error('generate.response.stream_bg_error', err, { chatId, userId: user.id });
        closeStream();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    logger.error('generate.response.unhandled_error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected error in generation route' },
      { status: 500 }
    );
  }
}
