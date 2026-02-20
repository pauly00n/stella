import { useEffect, useMemo, useState } from "react";
import { getChatById, type Chat, type Message } from "@/lib/services/chat-service";
import { MessageMetaSchema, type MessageMeta } from "@/lib/schemas/chat";

type ThinkingPhase = "analyzing" | "generating" | "refining" | "searching" | null;

function getMessageMeta(meta: unknown): MessageMeta {
  const parsed = MessageMetaSchema.safeParse(meta);
  return parsed.success ? parsed.data : {};
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
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null);

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

  const assistantImages = useMemo(() => {
    const assistants = messages.filter((m) => m.role !== "user");
    if (assistants.length === 0) return [];
    const last = assistants[assistants.length - 1];
    const meta = getMessageMeta(last.meta);
    return meta.images ?? [];
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
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role !== "user");

    if (userMessages.length === 1 && chat?.default_task === "auto") {
      if (assistantMessages.length > 0) {
        return assistantMessages.some((m) => {
          const meta = getMessageMeta(m.meta);
          const status = meta.status;
          return status && status !== "complete";
        });
      }
      return true;
    }

    if (userMessages.length !== 1 && assistantMessages.length === 0) {
      return false;
    }

    return assistantMessages.some((m) => {
      const meta = getMessageMeta(m.meta);
      const status = meta.status;
      return status && status !== "complete";
    });
  }, [messages, chat]);

  const shouldShowSearchingImages = useMemo(() => {
    if (!latestAssistantMessage) return false;
    const meta = getMessageMeta(latestAssistantMessage.meta);
    const wantImages = !!meta.showImages;
    const task = meta.task;
    const hasImages = Array.isArray(meta.images) && meta.images.length > 0;
    return wantImages && task !== "none" && !hasImages && !shouldShowPendingAssistant;
  }, [latestAssistantMessage, shouldShowPendingAssistant]);

  useEffect(() => {
    if (shouldShowSearchingImages) {
      setThinkingPhase("searching");
      return;
    }

    if (latestAssistantMessage) {
      const meta = getMessageMeta(latestAssistantMessage.meta);
      const status = meta.status;

      if (status === "analyzing_task") {
        setThinkingPhase("analyzing");
      } else if (status === "refining") {
        setThinkingPhase("refining");
      } else if (status === "generating") {
        setThinkingPhase("generating");
      } else if (status === "complete") {
        setThinkingPhase(null);
      } else if (meta.task === "refine") {
        setThinkingPhase("refining");
      } else if (meta.task === "diagnostic" || meta.task === "none") {
        setThinkingPhase("generating");
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
    } else if (chat.default_task === "refine") {
      setThinkingPhase("refining");
    } else if (chat.default_task === "diagnostic") {
      setThinkingPhase("generating");
    }
  }, [shouldShowPendingAssistant, chat, latestAssistantMessage, shouldShowSearchingImages]);

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

    fetch("/stella/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "images",
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

  useEffect(() => {
    if (!shouldShowPendingAssistant && !shouldShowSearchingImages) return;

    const interval = setInterval(() => {
      refetch({ silent: true }).catch(() => {});
    }, realtimeConnected ? 2500 : 2000);

    return () => clearInterval(interval);
  }, [shouldShowPendingAssistant, shouldShowSearchingImages, realtimeConnected, refetch]);

  return {
    chat,
    thinkingPhase,
    assistantImages,
    shouldShowPendingAssistant,
    shouldShowSearchingImages,
    orchestrationError,
    getMessageMeta,
  };
}

