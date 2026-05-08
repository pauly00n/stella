import { useCallback, useEffect, useMemo, useState } from "react";
import { getChatById, streamGenerate, type Chat, type Message, type TaskType } from "@/lib/services/chat-service";
import { MessageMetaSchema, type MessageMeta, type DifferentialGroup, type ImageMeta } from "@/lib/schemas/chat";

type ThinkingPhase = "analyzing" | "generating" | "searching" | null;

function getMessageMeta(meta: unknown): MessageMeta {
  const parsed = MessageMetaSchema.safeParse(meta);
  return parsed.success ? parsed.data : {};
}

// Module-level store so streaming content survives client-side navigations.
const streamingStore: Map<string, string> = new Map();
const streamingListeners: Map<string, Set<(text: string) => void>> = new Map();
const STREAM_DONE = '__done__';
const STREAM_ERROR = '__error__';

function notifyListeners(chatId: string, text: string) {
  streamingListeners.get(chatId)?.forEach((fn) => fn(text));
}

/**
 * Starts an SSE stream for a chat. Runs in module scope so it survives
 * component unmounts during client-side navigation.
 */
export function startStreamForChat(params: {
  chatId: string;
  draft: string;
  mode: TaskType;
  showImages: boolean;
  idempotencyKey: string;
}) {
  if (streamingStore.has(params.chatId)) return;
  streamingStore.set(params.chatId, '');

  (async () => {
    try {
      for await (const event of streamGenerate(params)) {
        if ('chunk' in event) {
          const next = (streamingStore.get(params.chatId) ?? '') + event.chunk;
          streamingStore.set(params.chatId, next);
          notifyListeners(params.chatId, next);
        } else if ('done' in event) {
          notifyListeners(params.chatId, STREAM_DONE);
        } else if ('error' in event) {
          streamingStore.delete(params.chatId);
          notifyListeners(params.chatId, STREAM_ERROR);
        }
      }
    } catch (e) {
      console.error('[orchestration] stream error:', e);
      streamingStore.delete(params.chatId);
      notifyListeners(params.chatId, STREAM_ERROR);
    }
  })();
}

export function useChatOrchestration({
  chatID,
  messages,
  realtimeConnected,
  refetch,
}: {
  chatID: string;
  messages: Message[];
  realtimeConnected: boolean;
  refetch: (options?: { silent?: boolean }) => Promise<void>;
}) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState<ThinkingPhase>(null);
  const [imagesRequestStarted, setImagesRequestStarted] = useState(false);
  const [papersRequestStarted, setPapersRequestStarted] = useState(false);
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null);

  // Initialize from module-level store in case component mounted after stream started
  const [streamingContent, setStreamingContent] = useState<string>(
    () => streamingStore.get(chatID) ?? ''
  );

  const clearStreamingContent = useCallback(() => {
    setStreamingContent('');
    streamingStore.delete(chatID);
  }, [chatID]);

  // Subscribe to module-level stream updates
  useEffect(() => {
    const listener = (text: string) => {
      if (text === STREAM_DONE) {
        refetch({ silent: true }).catch(() => {});
      } else if (text === STREAM_ERROR) {
        setStreamingContent('');
        refetch({ silent: true }).catch(() => {});
      } else {
        setStreamingContent(text);
      }
    };

    if (!streamingListeners.has(chatID)) {
      streamingListeners.set(chatID, new Set());
    }
    streamingListeners.get(chatID)!.add(listener);

    // Sync with any content that arrived before this mount
    const current = streamingStore.get(chatID);
    if (current) setStreamingContent(current);

    return () => {
      streamingListeners.get(chatID)?.delete(listener);
    };
  // refetch intentionally excluded
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatID]);

  useEffect(() => {
    if (!chatID) return;
    getChatById(chatID)
      .then((result) => {
        setChat(result);
        setOrchestrationError(null);
      })
      .catch((err) => {
        setOrchestrationError(
          err instanceof Error ? err.message : "Failed to load chat metadata",
        );
      });
  }, [chatID]);

  // Partition messages once per render. The `meta` field is parsed lazily where used.
  const { userMessages, assistantMessages, latestAssistantMessage, latestAssistantMeta } = useMemo(() => {
    const users: Message[] = [];
    const assistants: Message[] = [];
    for (const m of messages) {
      if (m.role === 'user') users.push(m);
      else assistants.push(m);
    }
    const latest = assistants.length > 0 ? assistants[assistants.length - 1] : null;
    return {
      userMessages: users,
      assistantMessages: assistants,
      latestAssistantMessage: latest,
      latestAssistantMeta: latest ? getMessageMeta(latest.meta) : null,
    };
  }, [messages]);

  // Returns grouped image results from the latest assistant message.
  // Normalizes both legacy flat ImageResult[] and new DifferentialGroup[] formats.
  const assistantImages = useMemo((): DifferentialGroup[] => {
    const images = latestAssistantMeta?.images ?? [];
    if (images.length === 0) return [];

    // New format: first item carries a 'differentialName' key
    const first = images[0] as Record<string, unknown>;
    if (first && typeof first === "object" && "differentialName" in first) {
      return images as DifferentialGroup[];
    }

    // Legacy flat format: wrap in a single unlabeled group
    return [{ differentialName: "Images", searchQuery: "", images: images as ImageMeta[] }];
  }, [latestAssistantMeta]);

  const assistantMessageKey = useMemo(() => {
    if (!latestAssistantMessage || !latestAssistantMeta) return null;
    return `${latestAssistantMessage.message_id}-${latestAssistantMeta.status}-${latestAssistantMessage.content?.length || 0}`;
  }, [latestAssistantMessage, latestAssistantMeta]);

  const shouldShowPendingAssistant = useMemo(() => {
    // Always show the pending area while we have live streaming content,
    // regardless of DB state or whether chat metadata has loaded yet.
    if (streamingContent) return true;

    const hasIncompleteAssistant = assistantMessages.some((m) => {
      const status = getMessageMeta(m.meta).status;
      return status && status !== "complete";
    });

    // Auto-mode opener: show pending until assistant responds, even before any assistant row exists.
    if (userMessages.length === 1 && chat?.default_task === "auto") {
      return assistantMessages.length === 0 || hasIncompleteAssistant;
    }

    if (userMessages.length !== 1 && assistantMessages.length === 0) {
      return false;
    }

    return hasIncompleteAssistant;
  }, [userMessages, assistantMessages, chat, streamingContent]);

  const shouldShowSearchingImages = useMemo(() => {
    if (!latestAssistantMeta) return false;
    const wantImages = !!latestAssistantMeta.showImages;
    const hasImages = Array.isArray(latestAssistantMeta.images) && latestAssistantMeta.images.length > 0;
    return wantImages && latestAssistantMeta.task !== "none" && !hasImages && !shouldShowPendingAssistant;
  }, [latestAssistantMeta, shouldShowPendingAssistant]);

  // Once the DB message is complete, clear any streaming content so the
  // DB-backed render takes over without duplication.
  useEffect(() => {
    if (latestAssistantMeta?.status === 'complete' && streamingContent) {
      clearStreamingContent();
    }
  }, [latestAssistantMeta, streamingContent, clearStreamingContent]);

  useEffect(() => {
    // Once streaming content is arriving, the live text is the visual progress indicator.
    if (streamingContent) {
      setThinkingPhase(null);
      return;
    }

    if (shouldShowSearchingImages) {
      setThinkingPhase("searching");
      return;
    }

    if (latestAssistantMeta) {
      const status = latestAssistantMeta.status;
      setThinkingPhase(
        status === "analyzing_task" ? "analyzing" :
        status === "generating" ? "generating" :
        null
      );
      return;
    }

    if (!shouldShowPendingAssistant || !chat) {
      setThinkingPhase(null);
      return;
    }

    setThinkingPhase(chat.default_task === "auto" ? "analyzing" : "generating");
  }, [shouldShowPendingAssistant, chat, latestAssistantMeta, shouldShowSearchingImages, streamingContent]);

  useEffect(() => {
    if (!latestAssistantMessage || !latestAssistantMeta) return;
    const wantImages = !!latestAssistantMeta.showImages;
    const hasImagesArray = Array.isArray(latestAssistantMeta.images) && latestAssistantMeta.images.length > 0;
    const hasContent = !!latestAssistantMessage.content?.trim();

    if (
      !wantImages ||
      hasImagesArray ||
      imagesRequestStarted ||
      !hasContent ||
      latestAssistantMeta.status !== "complete" ||
      latestAssistantMeta.task === "none"
    ) {
      return;
    }

    setImagesRequestStarted(true);

    fetch("/api/stella/generate/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: chatID,
        draft: latestAssistantMessage.content,
        showImages: true,
        messageId: latestAssistantMessage.message_id,
      }),
    })
      .then(() => {
        refetch({ silent: true }).catch(() => {});
      })
      .catch((err) => {
        setOrchestrationError(
          err instanceof Error ? err.message : "Failed to trigger image generation",
        );
        setImagesRequestStarted(false);
      });
  }, [latestAssistantMessage, latestAssistantMeta, assistantMessageKey, chatID, imagesRequestStarted, refetch]);

  // Trigger paper search once text is complete — fires for all diagnostic results regardless of showImages
  useEffect(() => {
    if (!latestAssistantMessage || !latestAssistantMeta) return;
    const hasPapers = Array.isArray(latestAssistantMeta.papers) && latestAssistantMeta.papers.length > 0;

    if (
      hasPapers ||
      papersRequestStarted ||
      !latestAssistantMessage.content?.trim() ||
      latestAssistantMeta.status !== "complete" ||
      latestAssistantMeta.task === "none"
    ) return;

    setPapersRequestStarted(true);

    fetch("/api/stella/generate/papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: chatID,
        draft: latestAssistantMessage.content,
        messageId: latestAssistantMessage.message_id,
      }),
    })
      .then(() => refetch({ silent: true }).catch(() => {}))
      .catch(() => {
        setPapersRequestStarted(false);
      });
  }, [latestAssistantMessage, latestAssistantMeta, assistantMessageKey, chatID, papersRequestStarted, refetch]);

  useEffect(() => {
    if (!shouldShowPendingAssistant && !shouldShowSearchingImages) return;

    const interval = setInterval(() => {
      refetch({ silent: true }).catch(() => {});
    }, realtimeConnected ? 15000 : 2000);

    return () => clearInterval(interval);
  }, [shouldShowPendingAssistant, shouldShowSearchingImages, realtimeConnected, refetch]);

  const shouldShowPendingPapers = useMemo(() => {
    if (!latestAssistantMeta) return false;
    const hasPapers = Array.isArray(latestAssistantMeta.papers) && latestAssistantMeta.papers.length > 0;
    return (
      latestAssistantMeta.status === "complete" &&
      latestAssistantMeta.task !== "none" &&
      !hasPapers &&
      papersRequestStarted
    );
  }, [latestAssistantMeta, papersRequestStarted]);

  return {
    chat,
    thinkingPhase,
    assistantImages,
    shouldShowPendingAssistant,
    shouldShowSearchingImages,
    shouldShowPendingPapers,
    orchestrationError,
    getMessageMeta,
    streamingContent,
  };
}
