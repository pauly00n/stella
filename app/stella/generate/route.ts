'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateReport,
  generateImagesForDraft,
  selectTaskForAutoMode,
  type ImageResult,
} from '@/lib/services/generate-service';
import type { TaskType } from '@/lib/services/chat-service';

type InternalTask = 'refine' | 'diagnostic' | 'none';

interface GenerateForChatBody {
  // Common
  chatId: string;
  // Operation: 'response' (default) = generate text; 'images' = generate images for an existing response
  operation?: 'response' | 'images';

  // For 'response'
  draft?: string;
  mode?: TaskType; // UI mode: 'Auto' | 'Refine draft report' | 'Differential diagnostic'
  showImages?: boolean;

  // For 'images'
  // Optional explicit message to update; if omitted, latest assistant message in the chat is used
  messageId?: string;
}

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
  try {
    // Safely parse JSON body – handle empty / invalid payloads gracefully
    let body: GenerateForChatBody;
    try {
      body = (await request.json()) as GenerateForChatBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid or empty JSON body' },
        { status: 400 }
      );
    }
    const {
      chatId,
      draft,
      mode,
      showImages = false,
      operation = 'response',
      messageId,
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
          console.error('No user message found to derive draft for images:', userMsgError);
          return NextResponse.json(
            { ok: false, error: 'Missing draft for image generation' },
            { status: 400 }
          );
        }

        effectiveDraft = (userMessages[0] as any).content || '';
      }

      const trimmedDraft = effectiveDraft.trim();
      if (!trimmedDraft) {
        return NextResponse.json(
          { ok: false, error: 'Missing draft for image generation' },
          { status: 400 }
        );
      }

      const imageStart = Date.now();
      const generatedImages = await generateImagesForDraft(trimmedDraft);
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
        console.error('No assistant message found to attach images to:', fetchError);
        return NextResponse.json(
          { ok: false, error: 'No assistant message found for image attachment' },
          { status: 404 }
        );
      }

      const target: any = messages[0];
      const previousMeta = target.meta || {};
      const previousLatency =
        typeof previousMeta.latencyMs === 'number' ? previousMeta.latencyMs : 0;

      const newMeta = {
        ...previousMeta,
        images: generatedImages,
        latencyMs: previousLatency + imageLatency,
        showImages: true,
      };

      const { error: updateError } = await supabase
        .from('messages')
        .update({ meta: newMeta })
        .eq('message_id', target.message_id)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Failed updating message with images:', updateError);
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
        },
      })
      .select('message_id')
      .single();

    if (placeholderError) {
      console.error('Error inserting placeholder message:', placeholderError);
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
    let insertedMessages: any[] | null = null;
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
          },
        })
        .eq('message_id', placeholderMessageId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (updateError) {
        console.error('Error updating placeholder message:', updateError);
        return NextResponse.json(
          { ok: false, error: 'Failed to update assistant message' },
          { status: 500 }
        );
      }
      insertedMessages = [updatedData];
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
          },
        })
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (insertError) {
        console.error('Error inserting assistant message:', insertError);
        return NextResponse.json(
          { ok: false, error: 'Failed to save assistant message' },
          { status: 500 }
        );
      }
      insertedMessages = newMessages;
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
    console.error('Error in /stella/generate:', err);
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


