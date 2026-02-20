'use client';

import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { useMessages } from '@/hooks/use-messages';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import { ChatLoadingSkeleton } from '@/components/chat-loading-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { getChatById } from '@/lib/services/chat-service';
import type { Message, Chat, DefaultTask } from '@/lib/services/chat-service';
import {
  MessageMetaSchema,
  type MessageMeta,
} from '@/lib/schemas/chat';

function getMessageMeta(meta: unknown): MessageMeta {
  const parsed = MessageMetaSchema.safeParse(meta);
  return parsed.success ? parsed.data : {};
}

function ChatPageContent({ chatID }: { chatID: string }) {
  const { messages, loading, error, refetch } = useMessages(chatID);
  const [chat, setChat] = useState<Chat | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState<'analyzing' | 'generating' | 'refining' | 'searching' | null>(null);
  const [imagesRequestStarted, setImagesRequestStarted] = useState(false);
  
  // Use scrollbar visibility hooks for both scrollable areas
  const { scrollbarProps: messagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });
  
  const { scrollbarProps: imagesScrollbarProps } = useScrollbarVisibility({
    isExpanded: true,
    trackHover: true,
  });

  // Fetch chat to get default_task
  useEffect(() => {
    if (!chatID) return;
    getChatById(chatID)
      .then(setChat)
      .catch((err) => console.error('Error fetching chat:', err));
  }, [chatID]);

  // Find images from the most recent assistant message (if any)
  const assistantImages = useMemo(() => {
    const assistants = messages.filter((m) => m.role !== 'user');
    if (assistants.length === 0) return [];
    const last = assistants[assistants.length - 1];
    const meta = getMessageMeta(last.meta);
    return meta.images ?? [];
  }, [messages]);

  // Get the most recent assistant message and its meta
  const latestAssistantMessage = useMemo(() => {
    const assistants = messages.filter((m) => m.role !== 'user');
    if (assistants.length === 0) return null;
    return assistants[assistants.length - 1];
  }, [messages]);

  // Track assistant message status/content for image generation trigger
  const assistantMessageKey = useMemo(() => {
    if (!latestAssistantMessage) return null;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    return `${latestAssistantMessage.message_id}-${meta.status}-${latestAssistantMessage.content?.length || 0}`;
  }, [latestAssistantMessage]);

  const hasAssistantMessage = useMemo(
    () => messages.some((m) => m.role !== 'user'),
    [messages]
  );

  // Pending assistant: one user message and at least one assistant message
  // whose meta.status is not 'complete' (e.g., placeholder or in-progress).
  // Also show pending if mode is 'auto' and we have exactly one user message
  // (even if assistant messages haven't been loaded yet).
  const shouldShowPendingAssistant = useMemo(() => {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role !== 'user');

    // If we have exactly one user message and mode is 'auto', show pending assistant
    // (this handles the case where the generate API is still processing)
    if (userMessages.length === 1 && chat?.default_task === 'auto') {
      // If we have assistant messages, check if any are not complete
      if (assistantMessages.length > 0) {
        return assistantMessages.some((m) => {
          const meta = getMessageMeta(m.meta);
          const status = meta.status;
          return status && status !== 'complete';
        });
      }
      // If no assistant messages yet but mode is auto, show pending
      // (the generate API might still be creating the placeholder)
      return true;
    }

    if (userMessages.length !== 1 && assistantMessages.length === 0) {
      return false;
    }

    // If any assistant message is not complete, we are still pending.
    return assistantMessages.some((m) => {
      const meta = getMessageMeta(m.meta);
      const status = meta.status;
      return status && status !== 'complete';
    });
  }, [messages, chat]);

  // Check if we should show "Searching images..." when text is loaded but images aren't
  const shouldShowSearchingImages = useMemo(() => {
    if (!latestAssistantMessage) return false;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    const wantImages = !!meta.showImages;
    const task = meta.task;
    const hasImages = Array.isArray(meta.images) && meta.images.length > 0;
    // Show "Searching images..." if images were requested but not yet loaded
    return wantImages && task !== 'none' && !hasImages && !shouldShowPendingAssistant;
  }, [latestAssistantMessage, shouldShowPendingAssistant]);

  // Determine thinking phase based on message meta.status
  useEffect(() => {
    // If we should show "Searching images..." (text loaded, images not), set that phase
    if (shouldShowSearchingImages) {
      setThinkingPhase('searching');
      return;
    }

    // Check if we have an assistant message with status tracking
    if (latestAssistantMessage) {
      const meta = getMessageMeta(latestAssistantMessage.meta);
      const status = meta.status;
      
      if (status === 'analyzing_task') {
        setThinkingPhase('analyzing');
      } else if (status === 'refining') {
        setThinkingPhase('refining');
      } else if (status === 'generating') {
        setThinkingPhase('generating');
      } else if (status === 'complete') {
        // Hide thinking when complete (unless images are being searched)
        setThinkingPhase(null);
      } else {
        // Fallback: infer from task if status not available
        if (meta.task === 'refine') {
          setThinkingPhase('refining');
        } else if (meta.task === 'diagnostic' || meta.task === 'none') {
          setThinkingPhase('generating');
        } else {
          setThinkingPhase(null);
        }
      }
      return;
    }

    // No assistant message yet - show initial thinking based on chat default_task
    if (!shouldShowPendingAssistant) {
      setThinkingPhase(null);
      return;
    }

    // We're waiting for assistant response
    if (!chat) return;

    const defaultTask = chat.default_task;
    
    // If task is 'auto', show "Analyzing required task..." initially
    if (defaultTask === 'auto') {
      setThinkingPhase('analyzing');
    } else {
      // If not auto, go straight to the task-specific message
      if (defaultTask === 'refine') {
        setThinkingPhase('refining');
      } else if (defaultTask === 'diagnostic') {
        setThinkingPhase('generating');
      }
    }
  }, [shouldShowPendingAssistant, chat, latestAssistantMessage, shouldShowSearchingImages]);

  // If images were requested but not yet attached and task is not 'none', trigger image-generation POST
  useEffect(() => {
    if (!latestAssistantMessage) return;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    const wantImages = !!meta.showImages;
    const hasImagesArray = Array.isArray(meta.images) && meta.images.length > 0;
    const status = meta.status;
    const task = meta.task;
    const hasContent = latestAssistantMessage.content && latestAssistantMessage.content.trim().length > 0;

    // Only trigger if: images wanted, no images yet, not already started, message is complete with content, and task isn't 'none'
    if (!wantImages || hasImagesArray || imagesRequestStarted || !hasContent || status !== 'complete' || task === 'none') return;

    setImagesRequestStarted(true);

    fetch('/stella/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation: 'images',
        chatId: chatID,
        draft: latestAssistantMessage.content,
        showImages: true,
        messageId: latestAssistantMessage.message_id,
      }),
    })
      .then(() => {
        // Refresh messages to pick up images when ready
        refetch({ silent: true }).catch(() => {});
      })
      .catch((err) => {
        console.error('Error triggering image generation:', err);
        // Reset flag on error so it can retry
        setImagesRequestStarted(false);
      });
  }, [latestAssistantMessage, assistantMessageKey, chatID, imagesRequestStarted, refetch]);

  // While we're waiting on an assistant response OR pending images, keep polling.
  useEffect(() => {
    if (!shouldShowPendingAssistant && !shouldShowSearchingImages) return;

    const interval = setInterval(() => {
      // Silent refresh so we don't flip back to the full-page skeleton while polling.
      refetch({ silent: true }).catch(() => {
        // nope - we'll try again next tick
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [shouldShowPendingAssistant, shouldShowSearchingImages, refetch]);

  if (loading) {
    return <ChatLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-500">{error}</div>
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
                {messages.map((message, index) => {
                  const isUserMessage = message.role === 'user';
                  // Find the index of the last user message
                  const lastUserMessageIndex = messages.map((m, i) => ({ role: m.role, index: i }))
                    .filter(({ role }) => role === 'user')
                    .pop()?.index ?? -1;
                  const isLastUserMessage = isUserMessage && index === lastUserMessageIndex;
                  const hasAssistantMessages = messages.some((m) => m.role !== 'user');
                  
                  return (
                    <Fragment key={message.message_id}>
                      {isUserMessage ? (
                        <div
                          className={`w-full flex justify-end ${!shouldShowPendingAssistant ? 'pb-3' : ''}`}
                          style={{ marginRight: 'max(calc(100% - 500px - 25%), 3px)' }}
                        >
                          <Card
                            className="px-4 py-3 bg-red-500/10 border-none max-w-[500px]"
                          >
                            <div className="text-sm text-red-950 whitespace-pre-wrap">
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
                          
                          return (
                            <div className="pt-5 pb-5 w-full">
                              <div className="text-sm whitespace-pre-wrap text-left max-w-[650px] w-full mx-auto">
                                {message.content}
                              </div>
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
                })}

                {(shouldShowPendingAssistant) && (
                  <div className="pt-10 max-w-[650px] w-full">
                    {thinkingPhase && (
                      <div className="mb-3">
                      <span className="text-muted-foreground text-sm animate-pulse">
                        {thinkingPhase === 'analyzing' && 'Analyzing required task...'}
                        {thinkingPhase === 'generating' && 'Generating analysis...'}
                        {thinkingPhase === 'refining' && 'Refining draft...'}
                      </span>
                      </div>
                    )}
                    {shouldShowPendingAssistant && Array.from({ length: 9 }).map((_, index) => {
                      const widths = [100, 90, 70, 95, 75, 88, 92, 80, 96] ;
                      const width = widths[index % widths.length];
                      return (
                        <Skeleton
                          key={`pending-${index}`}
                          className="h-4 rounded mb-5 transition-all duration-1000 whitespace-pre-wrap self-start"
                          style={{ width: `${width}%` }}
                        />
                      );
                    })}
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
              {/* 3 box skeletons for images - each takes ~1/3 of available height */}
              <Skeleton className="flex-1 w-full rounded" />
              <Skeleton className="flex-1 w-full rounded" />
              <Skeleton className="flex-1 w-full rounded" />
            </div>
          ) : assistantImages.length > 0 ? (
            <div className="flex flex-col gap-4">
              {assistantImages.map((img, idx: number) => {
                // Prefer full image link for clarity; fall back to thumbnail if needed.
                const thumb = img.link || img.image?.thumbnailLink || img.thumbnailLink;
                // Prefer the source page (contextLink) over the direct image URL
                const href = img.image?.contextLink || img.contextLink || img.link || '#';
                const title = img.title || img.snippet || 'Related image';
                return (
                  <a
                    key={idx}
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
                      <div className="text-xs font-medium leading-snug">
                        {title}
                      </div>
                    </div>
                  </a>
                );
              })}
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
  const [mounted, setMounted] = useState(false);
  const params = useParams();
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Only access params after mounting to avoid SSR issues
  const chatID = useMemo(() => {
    if (!mounted || typeof window === 'undefined') return undefined;
    return params?.chatID as string | undefined;
  }, [mounted, params]);

  // While mounting on the client, show the same skeleton layout for a seamless transition.
  if (!mounted) {
    return <ChatLoadingSkeleton />;
  }

  if (!chatID) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Invalid chat ID</div>
      </div>
    );
  }

  return <ChatPageContent chatID={chatID} />;
}
