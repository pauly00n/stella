import { useState, useEffect, useCallback, useRef } from 'react';
import { getMessagesByChatId, type Message } from '@/lib/services/chat-service';
import { createClient } from '@/lib/supabase/client';

interface UseMessagesResult {
  messages: Message[];
  /**
   * True only for the very first load (or when chatID changes and we haven't loaded that chat yet)
   * Used to show the full-page skeleton once.
   */
  loading: boolean;
  error: string | null;
  /**
   * Refetch messages. By default this is a "silent" refresh that does NOT flip `loading` back to true
   * (so we don't show the full-page skeleton again).
   */
  refetch: (options?: { silent?: boolean }) => Promise<void>;
  /**
   * True when Supabase Realtime channel is actively subscribed.
   * Used to disable aggressive polling when push updates are healthy.
   */
  realtimeConnected: boolean;
}

/**
 * Custom hook for fetching messages for a chat
 * @param chatID - The ID of the chat to fetch messages for
 * @returns Messages, loading state, error state, and refetch function
 */
export function useMessages(chatID: string | undefined): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const fetchMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!chatID || typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    try {
      const silent = options?.silent ?? hasLoadedOnceRef.current;
      if (!silent) setLoading(true);
      setError(null);
      const data = await getMessagesByChatId(chatID);
      setMessages(data);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      // Only end the "initial load" spinner state; silent refreshes should not toggle it.
      if (!(options?.silent ?? hasLoadedOnceRef.current)) setLoading(false);
    }
  }, [chatID]);

  useEffect(() => {
    // New chatID should show the full-page skeleton again until first load completes.
    hasLoadedOnceRef.current = false;
    fetchMessages({ silent: false });
  }, [fetchMessages]);

  useEffect(() => {
    if (!chatID || typeof window === 'undefined') return;

    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${chatID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatID}`,
        },
        () => {
          fetchMessages({ silent: true }).catch(() => {});
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeConnected(false);
        }
      });

    return () => {
      setRealtimeConnected(false);
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [chatID, fetchMessages]);

  return {
    messages,
    loading,
    error,
    refetch: fetchMessages,
    realtimeConnected,
  };
}
