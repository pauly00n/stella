export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateImagesForDraft } from '@/lib/services/generate-service';
import { GenerateForChatBodySchema, MessageMetaSchema } from '@/lib/schemas/chat';
import { serverEnv } from '@/lib/env/server';
import { fetchLatestAssistantMessageForChat } from '@/lib/supabase/message-queries';
import {
  buildRouteContext,
  enforceRateLimit,
  parseJsonBody,
  unauthorizedResponse,
} from '@/lib/api/route-helpers';

export async function POST(request: NextRequest) {
  const { logger, clientIp } = buildRouteContext(request, '/api/stella/generate/images');

  try {
    const body = await parseJsonBody(request, GenerateForChatBodySchema);
    if (body.error) return body.error;

    const { chatId, draft, showImages = false, messageId } = body.data;

    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'Missing chatId' }, { status: 400 });
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    const limit = Number(serverEnv.RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE) || 10;
    const rateLimited = await enforceRateLimit({
      scope: 'generate:images',
      identifier: user.id || clientIp,
      limit,
      logger,
      logEvent: 'generate.images.rate_limited',
    });
    if (rateLimited) return rateLimited;

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
        logger.error('generate.images.no_user_message', userMsgError, { chatId, userId: user.id });
        return NextResponse.json({ ok: false, error: 'Missing draft for image generation' }, { status: 400 });
      }

      effectiveDraft = (userMessages[0]?.content ?? '').trim();
    }

    if (!effectiveDraft) {
      return NextResponse.json({ ok: false, error: 'Missing draft for image generation' }, { status: 400 });
    }

    const imageStart = Date.now();
    const { groups } = await generateImagesForDraft(effectiveDraft);
    const imageLatency = Date.now() - imageStart;

    const { data: messages, error: fetchError } = await fetchLatestAssistantMessageForChat(
      supabase,
      { chatId, userId: user.id, messageId },
    );

    if (fetchError || !messages || messages.length === 0) {
      logger.error('generate.images.no_assistant_message', fetchError, { chatId, userId: user.id, messageId: messageId ?? null });
      return NextResponse.json({ ok: false, error: 'No assistant message found for image attachment' }, { status: 404 });
    }

    const target = messages[0];
    const parsedMeta = MessageMetaSchema.safeParse(target.meta);
    const previousMeta = parsedMeta.success ? parsedMeta.data : {};
    const previousLatency = typeof previousMeta.latencyMs === 'number' ? previousMeta.latencyMs : 0;

    const { error: updateError } = await supabase
      .from('messages')
      .update({
        meta: {
          ...previousMeta,
          images: groups,
          latencyMs: previousLatency + imageLatency,
          showImages: true,
        },
      })
      .eq('message_id', target.message_id)
      .eq('user_id', user.id);

    if (updateError) {
      logger.error('generate.images.update_failed', updateError, { chatId, userId: user.id, messageId: target.message_id });
      return NextResponse.json({ ok: false, error: 'Failed to save images' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, groupCount: groups.length, latencyMs: imageLatency });
  } catch (err) {
    logger.error('generate.images.unhandled_error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected error in image generation' },
      { status: 500 }
    );
  }
}
