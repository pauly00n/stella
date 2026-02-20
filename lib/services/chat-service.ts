import type {
  DefaultTask,
  MessageMeta,
  TaskType,
} from '@/lib/schemas/chat';

export type { DefaultTask, TaskType };

export interface Chat {
  chat_id: string;
  user_id: string;
  title: string | null;
  default_task: DefaultTask;
  created_at: string;
  updated_at: string;
}

export interface Message {
  message_id: string;
  chat_id: string;
  user_id: string;
  role: string;
  content: string;
  meta: MessageMeta | null;
  created_at: string;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // no-op
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : 'Request failed';
    throw new Error(message);
  }

  return payload as T;
}

/**
 * Creates a new chat and initial message
 * @param messageContent - The content of the initial message
 * @param task - The task type selected by the user
 * @returns The created chat and message
 * @throws Error if chat or message creation fails
 */
export async function createChatWithMessage(
  messageContent: string,
  task: TaskType
): Promise<{ chat: Chat; message: Message }> {
  const payload = await apiRequest<{ ok: true; chat: Chat; message: Message }>(
    '/api/stella/chats',
    {
      method: 'POST',
      body: JSON.stringify({ messageContent, task }),
    }
  );

  return { chat: payload.chat, message: payload.message };
}

/**
 * Fetches all messages for a specific chat
 * @param chatID - The ID of the chat
 * @returns Array of messages for the chat
 * @throws Error if messages cannot be fetched
 */
export async function getMessagesByChatId(chatID: string): Promise<Message[]> {
  const payload = await apiRequest<{ ok: true; messages: Message[] }>(
    `/api/stella/chats/${encodeURIComponent(chatID)}/messages`
  );
  return payload.messages;
}

/**
 * Fetches a single chat by ID
 * @param chatID - The ID of the chat to fetch
 * @returns The chat
 * @throws Error if chat cannot be fetched
 */
export async function getChatById(chatID: string): Promise<Chat> {
  const payload = await apiRequest<{ ok: true; chat: Chat }>(
    `/api/stella/chats/${encodeURIComponent(chatID)}`
  );
  return payload.chat;
}

/**
 * Fetches all chats for the current user, ordered by most recently updated
 * @returns Array of chats for the user
 * @throws Error if chats cannot be fetched
 */
export async function getUserChats(): Promise<Chat[]> {
  const payload = await apiRequest<{ ok: true; chats: Chat[] }>('/api/stella/chats');
  return payload.chats;
}

/**
 * Updates the title of a chat
 * @param chatID - The ID of the chat to update
 * @param newTitle - The new title for the chat
 * @returns The updated chat
 * @throws Error if update fails
 */
export async function updateChatTitle(chatID: string, newTitle: string): Promise<Chat> {
  const payload = await apiRequest<{ ok: true; chat: Chat }>(
    `/api/stella/chats/${encodeURIComponent(chatID)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ title: newTitle }),
    }
  );
  return payload.chat;
}

/**
 * Deletes a chat and all its messages
 * @param chatID - The ID of the chat to delete
 * @throws Error if deletion fails
 */
export async function deleteChat(chatID: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/stella/chats/${encodeURIComponent(chatID)}`, {
    method: 'DELETE',
  });
}
