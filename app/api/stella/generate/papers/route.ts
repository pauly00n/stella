export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { searchPapersForContent } from '@/lib/services/generate-service';
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
  const { logger, clientIp } = buildRouteContext(request, '/api/stella/generate/papers');

  try {
    const body = await parseJsonBody(request, GenerateForChatBodySchema);
    if (body.error) return body.error;

    const { chatId, draft, messageId } = body.data;

    if (!chatId) {
      return NextResponse.json({ ok: false, error: 'Missing chatId' }, { status: 400 });
    }

    const content = (draft || '').trim();
    if (!content) {
      return NextResponse.json({ ok: false, error: 'Missing content for paper search' }, { status: 400 });
    }

    const { supabase, user } = await getAuthenticatedUser();
    if (!user) return unauthorizedResponse();

    const limit = Number(serverEnv.RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE) || 20;
    const rateLimited = await enforceRateLimit({
      scope: 'generate:papers',
      identifier: user.id || clientIp,
      limit,
      logger,
      logEvent: 'generate.papers.rate_limited',
    });
    if (rateLimited) return rateLimited;

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
