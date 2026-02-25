export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateReport,
  streamGeminiReport,
  generateImagesForDraft,
  selectTaskForAutoMode,
  searchPapersForContent,
} from '@/lib/services/generate-service';
import {
  GenerateForChatBodySchema,
  MessageMetaSchema,
  type GenerateForChatBody,
  type InternalTask,
  type TaskType,
} from '@/lib/schemas/chat';
import { createRequestLogger } from '@/lib/observability/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { serverEnv } from '@/lib/env/server';

function mapUiModeToInternalTask(
  mode: TaskType,
  autoTask: InternalTask | null
): InternalTask {
  if (mode === 'Auto') return autoTask ?? 'none';
  // All specific differential categories map to 'diagnostic'
  return 'diagnostic';
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const clientIp = forwardedFor.split(',')[0]?.trim() || 'unknown';
  const logger = createRequestLogger({
    requestId,
    route: '/stella/generate',
    clientIp,
  });

  try {
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid or empty JSON body' },
        { status: 400 }
      );
    }

    const parsedBody = GenerateForChatBodySchema.safeParse(jsonBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const body: GenerateForChatBody = parsedBody.data;
    const {
      chatId,
      draft,
      mode,
      showImages = false,
      operation = 'response',
      messageId,
      idempotencyKey,
    } = body;

    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: 'Missing chatId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const isImageOperation = operation === 'images';
    const limit =
      Number(
        isImageOperation
          ? serverEnv.RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE
          : serverEnv.RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE
      ) || (isImageOperation ? 10 : 20);

    const rateLimit = await checkRateLimit({
      scope: isImageOperation ? 'generate:images' : 'generate:response',
      identifier: user.id || clientIp,
      limit,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      logger.warn('generate.rate_limited', {
        userId: user.id,
        operation,
        limit,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'Rate limit exceeded. Please try again shortly.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.resetAtUnix),
          },
        }
      );
    }

    // Image-only operation: generate grouped images for an existing assistant message
    if (operation === 'images') {
      if (!showImages) {
        return NextResponse.json({ ok: true, groupCount: 0, latencyMs: 0 });
      }

      let effectiveDraft = (draft || '').trim();
      if (!effectiveDraft) {
        const { data: userMessages, error: userMsgError } = await supabase
          .from('messages')
          .select('content')
          .eq('chat_id', chatId)
          .eq('user_id', user.id)
          .eq('role', 'user')
          .order('created_at', { ascending: false })
          .limit(1);

        if (userMsgError || !userMessages || userMessages.length === 0) {
          logger.error('generate.images.no_user_message', userMsgError, {
            chatId,
            userId: user.id,
          });
          return NextResponse.json(
            { ok: false, error: 'Missing draft for image generation' },
            { status: 400 }
          );
        }

        effectiveDraft = userMessages[0]?.content ?? '';
      }

      const trimmedDraft = effectiveDraft.trim();
      if (!trimmedDraft) {
        return NextResponse.json(
          { ok: false, error: 'Missing draft for image generation' },
          { status: 400 }
        );
      }

      const imageStart = Date.now();
      const { groups } = await generateImagesForDraft(trimmedDraft);
      const imageLatency = Date.now() - imageStart;

      // Find target assistant message to update
      let query = supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);

      if (messageId) {
        query = query.eq('message_id', messageId);
      }

      const { data: messages, error: fetchError } = await query;

      if (fetchError || !messages || messages.length === 0) {
        logger.error('generate.images.no_assistant_message', fetchError, {
          chatId,
          userId: user.id,
          messageId: messageId ?? null,
        });
        return NextResponse.json(
          { ok: false, error: 'No assistant message found for image attachment' },
          { status: 404 }
        );
      }

      const target = messages[0];
      const parsedMeta = MessageMetaSchema.safeParse(target.meta);
      const previousMeta = parsedMeta.success ? parsedMeta.data : {};
      const previousLatency =
        typeof previousMeta.latencyMs === 'number' ? previousMeta.latencyMs : 0;

      const newMeta = {
        ...previousMeta,
        images: groups,
        latencyMs: previousLatency + imageLatency,
        showImages: true,
      };

      const { error: updateError } = await supabase
        .from('messages')
        .update({ meta: newMeta })
        .eq('message_id', target.message_id)
        .eq('user_id', user.id);

      if (updateError) {
        logger.error('generate.images.update_failed', updateError, {
          chatId,
          userId: user.id,
          messageId: target.message_id,
        });
        return NextResponse.json(
          { ok: false, error: 'Failed to save images' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        groupCount: groups.length,
        latencyMs: imageLatency,
      });
    }

    // Papers operation: search Semantic Scholar for one paper per differential diagnosis
    if (operation === 'papers') {
      const content = (draft || '').trim();
      if (!content) {
        return NextResponse.json(
          { ok: false, error: 'Missing content for paper search' },
          { status: 400 }
        );
      }

      const { groups } = await searchPapersForContent(content);

      let query = supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('user_id', user.id)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);

      if (messageId) query = query.eq('message_id', messageId);

      const { data: paperMessages, error: fetchError } = await query;

      if (fetchError || !paperMessages || paperMessages.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'No assistant message found for paper attachment' },
          { status: 404 }
        );
      }

      const target = paperMessages[0];
      const parsedMeta = MessageMetaSchema.safeParse(target.meta);
      const previousMeta = parsedMeta.success ? parsedMeta.data : {};

      const { error: updateError } = await supabase
        .from('messages')
        .update({ meta: { ...previousMeta, papers: groups } })
        .eq('message_id', target.message_id)
        .eq('user_id', user.id);

      if (updateError) {
        logger.error('generate.papers.update_failed', updateError, { chatId, userId: user.id });
        return NextResponse.json({ ok: false, error: 'Failed to save papers' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, groupCount: groups.length });
    }

    // Default: text response operation
    if (!draft || !draft.trim() || !mode) {
      return NextResponse.json(
        { ok: false, error: 'Missing draft or mode' },
        { status: 400 }
      );
    }

    // Idempotency guard
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
        logger.error('generate.response.idempotency_lookup_failed', existingError, {
          chatId,
          userId: user.id,
          idempotencyKey,
        });
      } else if (existingMessages && existingMessages.length > 0) {
        const existing = existingMessages[0];
        const parsedMeta = MessageMetaSchema.safeParse(existing.meta);
        return NextResponse.json({
          ok: true,
          task: parsedMeta.success ? parsedMeta.data.task ?? null : null,
          latencyMs:
            parsedMeta.success && typeof parsedMeta.data.latencyMs === 'number'
              ? parsedMeta.data.latencyMs
              : 0,
          messageId: existing.message_id,
          idempotent: true,
        });
      }
    }

    const start = Date.now();

    // Determine task (Auto mode asks Gemini; specific modes always = 'diagnostic')
    let autoTask: InternalTask | null = null;
    if (mode === 'Auto') {
      autoTask = await selectTaskForAutoMode(draft);
    }
    const task: InternalTask = mapUiModeToInternalTask(mode, autoTask);

    // Insert placeholder message for status tracking
    const initialStatus = mode === 'Auto' ? 'analyzing_task' : 'generating';

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
      logger.error('generate.response.placeholder_insert_failed', placeholderError, {
        chatId,
        userId: user.id,
        task,
      });
    } else {
      placeholderMessageId = placeholderData.message_id;

      // For Auto mode, update placeholder with resolved task
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

    // task === 'none': static response, no streaming needed
    if (task === 'none') {
      const resultText =
        'The description does not appear to be a radiology or clinical imaging finding. Please describe imaging features, mass characteristics, or clinical findings.';
      const noneLatencyMs = Date.now() - start;
      const noneMeta = {
        status: 'complete' as const,
        images: [],
        task,
        latencyMs: noneLatencyMs,
        showImages,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      };

      let noneMessageId: string | null = null;
      if (placeholderMessageId) {
        const { data: updatedData, error: updateError } = await supabase
          .from('messages')
          .update({ content: resultText, meta: noneMeta })
          .eq('message_id', placeholderMessageId)
          .eq('user_id', user.id)
          .select('message_id')
          .single();
        if (updateError) {
          logger.error('generate.response.placeholder_update_failed', updateError, { chatId, userId: user.id });
          return NextResponse.json({ ok: false, error: 'Failed to update assistant message' }, { status: 500 });
        }
        noneMessageId = updatedData.message_id;
      } else {
        const { data: newMsg, error: insertError } = await supabase
          .from('messages')
          .insert({ chat_id: chatId, user_id: user.id, role: 'assistant', content: resultText, meta: noneMeta })
          .select('message_id')
          .single();
        if (insertError) {
          logger.error('generate.response.insert_failed', insertError, { chatId, userId: user.id, task });
          return NextResponse.json({ ok: false, error: 'Failed to save assistant message' }, { status: 500 });
        }
        noneMessageId = newMsg.message_id;
      }
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', user.id);
      return NextResponse.json({ ok: true, task, latencyMs: noneLatencyMs, messageId: noneMessageId });
    }

    // task === 'diagnostic': stream Gemini response via SSE.
    // Use a queue-based ReadableStream so each enqueued chunk is flushed to the
    // socket immediately by Next.js's pipeToNodeResponse, rather than being
    // held in a TransformStream internal buffer.
    const encoder = new TextEncoder();
    const queue: Uint8Array[] = [];
    let streamDone = false;
    // notify() is set by the ReadableStream pull() to wake it when data arrives
    const notifier = { notify: null as null | (() => void) };

    const readable = new ReadableStream({
      async pull(controller) {
        console.log('[stream] pull called, queue:', queue.length, 'done:', streamDone);
        // Wait until there's something in the queue or the stream is done.
        while (queue.length === 0 && !streamDone) {
          await new Promise<void>((resolve) => { notifier.notify = resolve; });
        }
        if (queue.length > 0) {
          const chunk = queue.shift()!;
          console.log('[stream] enqueuing chunk, size:', chunk.length);
          controller.enqueue(chunk);
        } else {
          console.log('[stream] closing controller');
          controller.close();
        }
      },
    });

    const send = (obj: Record<string, unknown>) => {
      const encoded = encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
      queue.push(encoded);
      console.log('[stream] send(), queue now:', queue.length, 'keys:', Object.keys(obj).join(','));
      if (notifier.notify) { notifier.notify(); notifier.notify = null; }
    };

    const closeStream = () => {
      streamDone = true;
      console.log('[stream] closeStream()');
      if (notifier.notify) { notifier.notify(); notifier.notify = null; }
    };

    // Run the async generation in the background; the readable is returned
    // immediately so Next.js starts streaming before the async work completes.
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
        const finalMeta = {
          status: 'complete' as const,
          images: [],
          task,
          latencyMs: textLatencyMs,
          showImages,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        };

        let insertedMessageId: string | null = null;

        if (placeholderMessageId) {
          const { data: updatedData, error: updateError } = await supabase
            .from('messages')
            .update({ content: fullText, meta: finalMeta })
            .eq('message_id', placeholderMessageId)
            .eq('user_id', user.id)
            .select('message_id')
            .single();
          if (updateError) {
            logger.error('generate.response.placeholder_update_failed', updateError, { chatId, userId: user.id });
            send({ error: 'Failed to persist generated message' });
            closeStream();
            return;
          }
          insertedMessageId = updatedData.message_id;
        } else {
          const { data: newMsg, error: insertError } = await supabase
            .from('messages')
            .insert({ chat_id: chatId, user_id: user.id, role: 'assistant', content: fullText, meta: finalMeta })
            .select('message_id')
            .single();
          if (insertError) {
            logger.error('generate.response.insert_failed', insertError, { chatId, userId: user.id, task });
            send({ error: 'Failed to save assistant message' });
            closeStream();
            return;
          }
          insertedMessageId = newMsg.message_id;
        }

        await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('chat_id', chatId).eq('user_id', user.id);

        send({ done: true, task, latencyMs: textLatencyMs, messageId: insertedMessageId });
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
    logger.error('generate.unhandled_error', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected error in generation route',
      },
      { status: 500 }
    );
  }
}
