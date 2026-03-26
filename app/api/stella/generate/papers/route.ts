export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { searchPapersForContent } from '@/lib/services/generate-service';
import { GenerateForChatBodySchema, MessageMetaSchema } from '@/lib/schemas/chat';
import { createRequestLogger } from '@/lib/observability/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { serverEnv } from '@/lib/env/server';
import { fetchLatestAssistantMessageForChat } from '@/lib/supabase/message-queries';

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const clientIp = forwardedFor.split(',')[0]?.trim() || 'unknown';
  const logger = createRequestLogger({ requestId, route: '/api/stella/generate/papers', clientIp });

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

    const { chatId, draft, messageId } = parsedBody.data;

    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'Missing chatId' }, { status: 400 });
    }

    const content = (draft || '').trim();
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Missing content for paper search' }, { status: 400 });
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not authenticated' }, { status: 401 });
    }

    const limit = Number(serverEnv.RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE) || 20;
    const rateLimit = await checkRateLimit({
      scope: 'generate:papers',
      identifier: user.id || clientIp,
      limit,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      logger.warn('generate.papers.rate_limited', { userId: user.id, limit, retryAfterSeconds: rateLimit.retryAfterSeconds });
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

    const { groups } = await searchPapersForContent(content);

    const { data: paperMessages, error: fetchError } = await fetchLatestAssistantMessageForChat(
      supabase,
      { chatId, userId: user.id, messageId },
    );

    if (fetchError || !paperMessages || paperMessages.length === 0) {
      return NextResponse.json({ ok: false, error: 'No assistant message found for paper attachment' }, { status: 404 });
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
  } catch (err) {
    logger.error('generate.papers.unhandled_error', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected error in paper search' },
      { status: 500 }
    );
  }
}
