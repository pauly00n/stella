export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateImagesForDraft } from '@/lib/services/generate-service';
import { GenerateForChatBodySchema, MessageMetaSchema } from '@/lib/schemas/chat';
import { createRequestLogger } from '@/lib/observability/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { serverEnv } from '@/lib/env/server';
import { fetchLatestAssistantMessageForChat } from '@/lib/supabase/message-queries';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const clientIp = forwardedFor.split(',')[0]?.trim() || 'unknown';
  const logger = createRequestLogger({ requestId, route: '/api/stella/generate/images', clientIp });

  try {
    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid or empty JSON body' }, { status: 400 });
    }

    const parsedBody = GenerateForChatBodySchema.safeParse(jsonBody);
    if (!parsedBody.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request payload' }, { status: 400 });
    }

    const { chatId, draft, showImages = false, messageId } = parsedBody.data;

    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'Missing chatId' }, { status: 400 });
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not authenticated' }, { status: 401 });
    }

    const limit = Number(serverEnv.RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE) || 10;
    const rateLimit = await checkRateLimit({
      scope: 'generate:images',
      identifier: user.id || clientIp,
      limit,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      logger.warn('generate.images.rate_limited', { userId: user.id, limit, retryAfterSeconds: rateLimit.retryAfterSeconds });
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded. Please try again shortly.', retryAfterSeconds: rateLimit.retryAfterSeconds },
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

      effectiveDraft = userMessages[0]?.content ?? '';
    }

    const trimmedDraft = effectiveDraft.trim();
    if (!trimmedDraft) {
      return NextResponse.json({ ok: false, error: 'Missing draft for image generation' }, { status: 400 });
    }

    const imageStart = Date.now();
    const { groups } = await generateImagesForDraft(trimmedDraft);
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
