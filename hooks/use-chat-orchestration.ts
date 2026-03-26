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
          const prev = streamingStore.get(params.chatId) ?? '';
          const next = prev + event.chunk;
          streamingStore.set(params.chatId, next);
          notifyListeners(params.chatId, next);
        } else if ('done' in event) {
          notifyListeners(params.chatId, '__done__');
        } else if ('error' in event) {
          streamingStore.delete(params.chatId);
          notifyListeners(params.chatId, '__error__');
        }
      }
    } catch (e) {
      console.error('[orchestration] stream error:', e);
      streamingStore.delete(params.chatId);
      notifyListeners(params.chatId, '__error__');
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
      if (text === '__done__') {
        refetch({ silent: true }).catch(() => {});
      } else if (text === '__error__') {
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

  // Returns grouped image results from the latest assistant message.
  // Normalizes both old flat ImageResult[] and new DifferentialGroup[] formats.
  const assistantImages = useMemo((): DifferentialGroup[] => {
    const assistants = messages.filter((m) => m.role !== "user");
    if (assistants.length === 0) return [];
    const last = assistants[assistants.length - 1];
    const meta = getMessageMeta(last.meta);
    const images = meta.images ?? [];
    if (images.length === 0) return [];

    // New format: first item has a 'differentialName' key
    const first = images[0] as Record<string, unknown>;
    if (first && typeof first === "object" && "differentialName" in first) {
      return images as DifferentialGroup[];
    }

    // Legacy flat format: wrap in a single unlabeled group
    return [{ differentialName: "Images", searchQuery: "", images: images as ImageMeta[] }];
  }, [messages]);

  const latestAssistantMessage = useMemo(() => {
    const assistants = messages.filter((m) => m.role !== "user");
    if (assistants.length === 0) return null;
    return assistants[assistants.length - 1];
  }, [messages]);

  const assistantMessageKey = useMemo(() => {
    if (!latestAssistantMessage) return null;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    return `${latestAssistantMessage.message_id}-${meta.status}-${latestAssistantMessage.content?.length || 0}`;
  }, [latestAssistantMessage]);

  const shouldShowPendingAssistant = useMemo(() => {
    // Always show the pending area while we have live streaming content,
    // regardless of DB state or whether chat metadata has loaded yet.
    if (streamingContent) return true;

    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role !== "user");

    if (userMessages.length === 1 && chat?.default_task === "auto") {
      if (assistantMessages.length > 0) {
        return assistantMessages.some((m) => {
          const meta = getMessageMeta(m.meta);
          return meta.status && meta.status !== "complete";
        });
      }
      return true;
    }

    if (userMessages.length !== 1 && assistantMessages.length === 0) {
      return false;
    }

    return assistantMessages.some((m) => {
      const meta = getMessageMeta(m.meta);
      return meta.status && meta.status !== "complete";
    });
  }, [messages, chat, streamingContent]);

  const shouldShowSearchingImages = useMemo(() => {
    if (!latestAssistantMessage) return false;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    const wantImages = !!meta.showImages;
    const task = meta.task;
    const hasImages = Array.isArray(meta.images) && meta.images.length > 0;
    return wantImages && task !== "none" && !hasImages && !shouldShowPendingAssistant;
  }, [latestAssistantMessage, shouldShowPendingAssistant]);

  // Once the DB message is complete, clear any streaming content so the
  // DB-backed render takes over without duplication.
  useEffect(() => {
    if (!latestAssistantMessage) return;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    if (meta.status === 'complete' && streamingContent) {
      clearStreamingContent();
    }
  }, [latestAssistantMessage, streamingContent, clearStreamingContent]);

  useEffect(() => {
    // Once streaming content is arriving, clear any thinking phase label —
    // the live text is the visual indicator of progress.
    if (streamingContent) {
      setThinkingPhase(null);
      return;
    }

    if (shouldShowSearchingImages) {
      setThinkingPhase("searching");
      return;
    }

    if (latestAssistantMessage) {
      const meta = getMessageMeta(latestAssistantMessage.meta);
      const status = meta.status;

      if (status === "analyzing_task") {
        setThinkingPhase("analyzing");
      } else if (status === "generating") {
        setThinkingPhase("generating");
      } else if (status === "complete") {
        setThinkingPhase(null);
      } else {
        setThinkingPhase(null);
      }
      return;
    }

    if (!shouldShowPendingAssistant) {
      setThinkingPhase(null);
      return;
    }

    if (!chat) return;
    if (chat.default_task === "auto") {
      setThinkingPhase("analyzing");
    } else {
      setThinkingPhase("generating");
    }
  }, [shouldShowPendingAssistant, chat, latestAssistantMessage, shouldShowSearchingImages, streamingContent]);

  useEffect(() => {
    if (!latestAssistantMessage) return;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    const wantImages = !!meta.showImages;
    const hasImagesArray = Array.isArray(meta.images) && meta.images.length > 0;
    const status = meta.status;
    const task = meta.task;
    const hasContent =
      latestAssistantMessage.content && latestAssistantMessage.content.trim().length > 0;

    if (
      !wantImages ||
      hasImagesArray ||
      imagesRequestStarted ||
      !hasContent ||
      status !== "complete" ||
      task === "none"
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
  }, [latestAssistantMessage, assistantMessageKey, chatID, imagesRequestStarted, refetch]);

  // Trigger paper search once text is complete — fires for all diagnostic results regardless of showImages
  useEffect(() => {
    if (!latestAssistantMessage) return;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    if (
      (Array.isArray(meta.papers) && meta.papers.length > 0) ||
      papersRequestStarted ||
      !latestAssistantMessage.content?.trim() ||
      meta.status !== "complete" ||
      meta.task === "none"
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
  }, [latestAssistantMessage, assistantMessageKey, chatID, papersRequestStarted, refetch]);

  useEffect(() => {
    if (!shouldShowPendingAssistant && !shouldShowSearchingImages) return;

    const interval = setInterval(() => {
      refetch({ silent: true }).catch(() => {});
    }, realtimeConnected ? 15000 : 2000);

    return () => clearInterval(interval);
  }, [shouldShowPendingAssistant, shouldShowSearchingImages, realtimeConnected, refetch]);

  const shouldShowPendingPapers = useMemo(() => {
    if (!latestAssistantMessage) return false;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    return (
      meta.status === "complete" &&
      meta.task !== "none" &&
      !(Array.isArray(meta.papers) && meta.papers.length > 0) &&
      papersRequestStarted
    );
  }, [latestAssistantMessage, papersRequestStarted]);

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
