'use client';

import { useEffect, Fragment } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card } from '@/components/ui/card';
import { useMessages } from '@/hooks/use-messages';
import { useChatOrchestration } from '@/hooks/use-chat-orchestration';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import { ChatLoadingSkeleton } from '@/components/chat-loading-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

function ChatPageContent({ chatID }: { chatID: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { messages, loading, error, refetch, realtimeConnected } = useMessages(chatID);
  const {
    chat,
    thinkingPhase,
    assistantImages,
    shouldShowPendingAssistant,
    shouldShowSearchingImages,
    shouldShowPendingPapers,
    orchestrationError,
    getMessageMeta,
    streamingContent,
  } = useChatOrchestration({
    chatID,
    messages,
    realtimeConnected,
    refetch,
  });
  
  // Use scrollbar visibility hooks for both scrollable areas
  const { scrollbarProps: messagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });
  
  const { scrollbarProps: imagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });

  if (loading && messages.length === 0) {
    return <ChatLoadingSkeleton />;
  }

  if (error || orchestrationError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-500">{error || orchestrationError}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Chat Interface - 70% width */}
      <div className="flex flex-col border-r border-border h-screen overflow-hidden" style={{ flex: '7', minWidth: 0 }}>
        <div 
          className="flex-1 overflow-y-auto p-4 min-h-0 stella-scrollbar"
          {...messagesScrollbarProps}
        >
          <div className="flex items-center justify-center">
          <div
            className={`flex flex-col items-center w-full ${
              shouldShowPendingAssistant ? 'pr-8' : 'space-y-3'
            }`}
          >
            <div className="py-1"></div>
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground mt-8 self-end">
                No messages yet
              </div>
            ) : (
              <>
                {(() => {
                  const lastUserMessageIndex = messages.reduce((last, m, i) => m.role === 'user' ? i : last, -1);
                  const hasAssistantMessages = messages.some((m) => m.role !== 'user');
                  return messages.map((message, index) => {
                  const isUserMessage = message.role === 'user';
                  const isLastUserMessage = isUserMessage && index === lastUserMessageIndex;
                  
                  return (
                    <Fragment key={message.message_id}>
                      {isUserMessage ? (
                        <div
                          className={`w-full flex justify-end ${!shouldShowPendingAssistant ? 'pb-3' : ''}`}
                          style={{ marginRight: 'max(calc(100% - 500px - 25%), 3px)' }}
                        >
                          <Card
                            className="px-4 py-3 border-none max-w-[500px]"
                            style={{ backgroundColor: isDark ? 'var(--stella-accent-text)' : 'var(--stella-accent-muted)' }}
                          >
                            <div className="text-sm whitespace-pre-wrap" style={{ color: isDark ? 'rgba(255,255,255,0.85)' : 'var(--stella-accent-text)' }}>
                              {message.content}
                            </div>
                          </Card>
                        </div>
                      ) : (
                        // Only render assistant message if it has content or is complete
                        // (skip placeholder messages that are still being generated)
                        (() => {
                          const meta = getMessageMeta(message.meta);
                          const status = meta.status;
                          const hasContent = message.content && message.content.trim().length > 0;
                          const isComplete = status === 'complete';

                          // Skip rendering if it's a placeholder (no content and not complete)
                          if (!hasContent && !isComplete) {
                            return null;
                          }

                          const papers = meta.papers;

                          return (
                            <div className="pt-5 pb-5 w-full">
                              <div className="text-sm prose prose-sm prose-neutral dark:prose-invert text-left max-w-[650px] w-full mx-auto [&_p]:leading-[1.6] [&_li]:leading-[1.6] [&_p]:text-[15px] [&_li]:text-[15px]">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {message.content}
                                  </ReactMarkdown>
                              </div>
                              {/* Paper citations — shown once loaded, or skeleton while pending */}
                              {papers && papers.length > 0 ? (
                                <div className="max-w-[650px] w-full mx-auto mt-5 pt-4 border-t border-border">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                    References
                                  </div>
                                  <div className="flex flex-col gap-3">
                                    {papers.map((group, i) =>
                                      group.paper ? (
                                        <div key={i} className="flex flex-col gap-0.5">
                                          <span className="text-xs text-muted-foreground">{group.diagnosisName}</span>
                                          <a
                                            href={group.paper.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline leading-snug"
                                          >
                                            {group.paper.title}
                                          </a>
                                          <span className="text-xs text-muted-foreground">{group.paper.authors}</span>
                                        </div>
                                      ) : null
                                    )}
                                  </div>
                                </div>
                              ) : shouldShowPendingPapers ? (
                                <div className="max-w-[650px] w-full mx-auto mt-5 pt-4 border-t border-border">
                                  <Skeleton className="h-3 w-24 mb-3" />
                                  {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex flex-col gap-1 mb-3">
                                      <Skeleton className="h-3 w-32" />
                                      <Skeleton className="h-4 w-full" />
                                      <Skeleton className="h-3 w-40" />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()
                      )}
                      {/* Show "Searching images..." after the last user message, before assistant messages */}
                      {isLastUserMessage && hasAssistantMessages && shouldShowSearchingImages && (
                        <div className="pt-3 max-w-[650px] w-full">
                            <span className="text-muted-foreground text-sm animate-pulse">
                              Searching for images...
                            </span>
                        </div>
                      )}
                    </Fragment>
                  );
                });
                })()}

                {shouldShowPendingAssistant && (
                  <div className="pt-10 max-w-[650px] w-full">
                    {/* Thinking phase label — shown only during the auto-mode task analysis phase */}
                    {thinkingPhase === 'analyzing' && !streamingContent && (
                      <div className="mb-3">
                        <span className="text-muted-foreground text-sm animate-pulse">
                          Analyzing description...
                        </span>
                      </div>
                    )}

                    {streamingContent ? (
                      /* Live streaming text — replaces the skeleton */
                      <div className="text-sm prose prose-sm prose-neutral dark:prose-invert text-left w-full [&_p]:leading-[1.6] [&_li]:leading-[1.6] [&_p]:text-[15px] [&_li]:text-[15px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {streamingContent}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      /* Skeleton — shown while waiting for first chunk */
                      Array.from({ length: 9 }).map((_, index) => {
                        const widths = [100, 90, 70, 95, 75, 88, 92, 80, 96];
                        const width = widths[index % widths.length];
                        return (
                          <Skeleton
                            key={`pending-${index}`}
                            className="h-4 rounded mb-5 transition-all duration-1000 whitespace-pre-wrap self-start"
                            style={{ width: `${width}%` }}
                          />
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Images Column - 30% width, sticky position */}
      <div className="flex flex-col border-l border-border h-screen overflow-hidden bg-card sticky top-0" style={{ flex: '3', minWidth: 0 }}>
        <div 
          className="flex-1 overflow-y-auto p-4 min-h-0 stella-scrollbar"
          {...imagesScrollbarProps}
        >
          {shouldShowPendingAssistant || shouldShowSearchingImages ? (
            <div className="flex flex-col gap-4 h-full">
              {/* 3 group skeletons */}
              <Skeleton className="flex-1 w-full rounded" />
              <Skeleton className="flex-1 w-full rounded" />
              <Skeleton className="flex-1 w-full rounded" />
            </div>
          ) : assistantImages.length > 0 ? (
            <div className="flex flex-col gap-6">
              {assistantImages.map((group, groupIdx) => (
                <div key={groupIdx}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1.5 border-b border-border mb-3">
                    Results for {group.differentialName}
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.images.map((img, imgIdx) => {
                      const thumb = img.link || img.image?.thumbnailLink || img.thumbnailLink;
                      const href = img.image?.contextLink || img.contextLink || img.link || '#';
                      const title = img.title || img.snippet || 'Related image';
                      return (
                        <a
                          key={imgIdx}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-md border border-border overflow-hidden bg-background hover:bg-accent transition-colors"
                        >
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt={title}
                              className="w-full h-full object-contain bg-black/5"
                            />
                          )}
                          <div className="p-2">
                            <div className="text-xs font-medium leading-snug">{title}</div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground mt-8">
              Images will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const chatID = params?.chatID as string | undefined;

  if (!chatID) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Invalid chat ID</div>
      </div>
    );
  }

  return <ChatPageContent chatID={chatID} />;
}
