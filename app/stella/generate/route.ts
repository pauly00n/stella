'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateReport,
  generateImagesForDraft,
  selectTaskForAutoMode,
  type ImageResult,
} from '@/lib/services/generate-service';
import {
  GenerateForChatBodySchema,
  MessageMetaSchema,
  type GenerateForChatBody,
  type InternalTask,
  type TaskType,
} from '@/lib/schemas/chat';
import { createRequestLogger } from '@/lib/observability/logger';

function mapUiModeToInternalTask(
  mode: TaskType,
  autoTask: InternalTask | null
): InternalTask {
  if (mode === 'Auto') {
    return autoTask ?? 'none';
  }
  if (mode === 'Refine draft report') return 'refine';
  if (mode === 'Differential diagnostic') return 'diagnostic';
  return 'none';
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const logger = createRequestLogger({
    requestId,
    route: '/stella/generate',
  });

  try {
    // Safely parse JSON body – handle empty / invalid payloads gracefully
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

    // Image-only operation: generate images for an existing assistant message
    if (operation === 'images') {
      if (!showImages) {
        return NextResponse.json({ ok: true, imagesCount: 0, latencyMs: 0 });
      }

      // Prefer provided draft; if missing/empty, fall back to latest user message content
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
      const { images: generatedImages, imageQuery } = await generateImagesForDraft(trimmedDraft);
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
        images: generatedImages,
        latencyMs: previousLatency + imageLatency,
        showImages: true,
        imageQuery,
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
        imagesCount: generatedImages.length,
        latencyMs: imageLatency,
      });
    }

    // Default: text response operation
    if (!draft || !draft.trim() || !mode) {
      return NextResponse.json(
        { ok: false, error: 'Missing draft or mode' },
        { status: 400 }
      );
    }

    // Idempotency guard for response generation: if this request key already created
    // an assistant message, return it instead of generating again.
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
          latencyMs: parsedMeta.success && typeof parsedMeta.data.latencyMs === 'number'
            ? parsedMeta.data.latencyMs
            : 0,
          imagesCount:
            parsedMeta.success && Array.isArray(parsedMeta.data.images)
              ? parsedMeta.data.images.length
              : 0,
          messageId: existing.message_id,
          idempotent: true,
        });
      }
    }

    const start = Date.now();

    // Determine task first (needed for placeholder status)
    let autoTask: InternalTask | null = null;
    if (mode === 'Auto') {
      autoTask = await selectTaskForAutoMode(draft);
    }
    const task: InternalTask = mapUiModeToInternalTask(mode, autoTask);

    // Insert placeholder message early for status tracking (for both Auto and non-Auto modes)
    let placeholderMessageId: string | null = null;
    let initialStatus: string;
    if (mode === 'Auto') {
      initialStatus = 'analyzing_task';
    } else {
      // For non-Auto mode, we know the task immediately
      initialStatus = task === 'refine' ? 'refining' : task === 'diagnostic' ? 'generating' : 'complete';
    }

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

    if (placeholderError) {
      logger.error('generate.response.placeholder_insert_failed', placeholderError, {
        chatId,
        userId: user.id,
        task,
      });
      // Continue anyway - we'll insert at the end
    } else {
      placeholderMessageId = placeholderData.message_id;
      
      // For Auto mode, update placeholder with determined task status
      if (mode === 'Auto' && autoTask) {
        const taskStatus = autoTask === 'refine' ? 'refining' : autoTask === 'diagnostic' ? 'generating' : 'complete';
        await supabase
          .from('messages')
          .update({
            meta: {
              status: taskStatus,
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

    let resultText: string;
    let images: ImageResult[] = [];

    if (task === 'none') {
      resultText =
        'The prompt does not appear to be a draft report or a clinical / imaging description.';
      
      // Update placeholder if it exists
      if (placeholderMessageId) {
        await supabase
          .from('messages')
          .update({
            content: resultText,
            meta: {
              status: 'complete',
              images: [],
              task,
              latencyMs: Date.now() - start,
              showImages,
              ...(idempotencyKey ? { idempotencyKey } : {}),
            },
          })
          .eq('message_id', placeholderMessageId)
          .eq('user_id', user.id);
      }
    } else {
      // Text-only generation
      const gen = await generateReport({
        draft,
        mode: task === 'refine' ? 'report' : 'diagnostic',
        includeImages: false,
      });

      if (!gen.ok || !gen.result) {
        // Clean up placeholder if generation failed
        if (placeholderMessageId) {
          await supabase
            .from('messages')
            .delete()
            .eq('message_id', placeholderMessageId)
            .eq('user_id', user.id);
        }
        return NextResponse.json(
          { ok: false, error: gen.error || 'Generation failed' },
          { status: 500 }
        );
      }

      resultText = gen.result;
      images = [];
    }

    const textLatencyMs = Date.now() - start;

    // Update existing placeholder or insert new message
    let insertedMessages: Array<{ message_id: string }> | null = null;
    if (placeholderMessageId) {
      // Update the placeholder with final content
      const { data: updatedData, error: updateError } = await supabase
        .from('messages')
        .update({
          content: resultText,
          meta: {
            status: 'complete',
            images,
            task,
            latencyMs: textLatencyMs,
            showImages,
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        })
        .eq('message_id', placeholderMessageId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (updateError) {
        logger.error('generate.response.placeholder_update_failed', updateError, {
          chatId,
          userId: user.id,
          messageId: placeholderMessageId,
        });
        return NextResponse.json(
          { ok: false, error: 'Failed to update assistant message' },
          { status: 500 }
        );
      }
      insertedMessages = [{ message_id: updatedData.message_id }];
    } else {
      // Insert new message (non-Auto mode or placeholder insert failed)
      // For non-Auto mode, generation is already complete, so set status to 'complete'
      const { data: newMessages, error: insertError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          user_id: user.id,
          role: 'assistant',
          content: resultText,
          meta: {
            status: 'complete',
            images,
            task,
            latencyMs: textLatencyMs,
            showImages,
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        })
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (insertError) {
        logger.error('generate.response.insert_failed', insertError, {
          chatId,
          userId: user.id,
          task,
        });
        return NextResponse.json(
          { ok: false, error: 'Failed to save assistant message' },
          { status: 500 }
        );
      }
      insertedMessages = (newMessages || []).map((message) => ({
        message_id: message.message_id,
      }));
    }

    // Optionally update chat updated_at
    await supabase
      .from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      task,
      latencyMs: textLatencyMs,
      imagesCount: images.length,
      messageId: insertedMessages?.[0]?.message_id ?? null,
    });
  } catch (err) {
    logger.error('generate.unhandled_error', err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Unexpected error in generation route',
      },
      { status: 500 }
    );
  }
}
