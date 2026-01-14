import { createClient } from '@/lib/supabase/client';

export type TaskType = 'Auto' | 'Refine draft report' | 'Differential diagnostic';
export type DefaultTask = 'auto' | 'refine' | 'diagnostic';

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
  meta: any | null;
  created_at: string;
}

/**
 * Maps UI task selection to database value
 */
const mapTaskToDefaultTask = (task: TaskType): DefaultTask => {
  const taskMap: Record<TaskType, DefaultTask> = {
    'Auto': 'auto',
    'Refine draft report': 'refine',
    'Differential diagnostic': 'diagnostic'
  };
  return taskMap[task];
};

/**
 * Gets the current authenticated user
 * @throws Error if user is not authenticated
 */
async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('User not authenticated');
  }
  
  return user;
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
  const supabase = createClient();
  const user = await getCurrentUser();
  const defaultTask = mapTaskToDefaultTask(task);

  // Create chat
  const { data: chatData, error: chatError } = await supabase
    .from('chats')
    .insert({
      user_id: user.id,
      default_task: defaultTask,
    })
    .select()
    .single();

  if (chatError || !chatData) {
    console.error('Error creating chat:', chatError);
    throw new Error('Failed to create chat');
  }

  // Create message
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .insert({
      chat_id: chatData.chat_id,
      user_id: user.id,
      role: 'user',
      content: messageContent,
    })
    .select()
    .single();

  if (messageError || !messageData) {
    console.error('Error creating message:', messageError);
    throw new Error('Failed to create message');
  }

  return { chat: chatData, message: messageData };
}

/**
 * Fetches all messages for a specific chat
 * @param chatID - The ID of the chat
 * @returns Array of messages for the chat
 * @throws Error if messages cannot be fetched
 */
export async function getMessagesByChatId(chatID: string): Promise<Message[]> {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: messagesData, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatID)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('Error fetching messages:', messagesError);
    throw new Error('Failed to load messages');
  }

  return messagesData || [];
}

/**
 * Fetches a single chat by ID
 * @param chatID - The ID of the chat to fetch
 * @returns The chat
 * @throws Error if chat cannot be fetched
 */
export async function getChatById(chatID: string): Promise<Chat> {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: chatData, error: chatError } = await supabase
    .from('chats')
    .select('*')
    .eq('chat_id', chatID)
    .eq('user_id', user.id)
    .single();

  if (chatError || !chatData) {
    console.error('Error fetching chat:', chatError);
    throw new Error('Failed to load chat');
  }

  return chatData;
}

/**
 * Fetches all chats for the current user, ordered by most recently updated
 * @returns Array of chats for the user
 * @throws Error if chats cannot be fetched
 */
export async function getUserChats(): Promise<Chat[]> {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: chatsData, error: chatsError } = await supabase
    .from('chats')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (chatsError) {
    console.error('Error fetching chats:', chatsError);
    throw new Error('Failed to load chats');
  }

  return chatsData || [];
}

/**
 * Updates the title of a chat
 * @param chatID - The ID of the chat to update
 * @param newTitle - The new title for the chat
 * @returns The updated chat
 * @throws Error if update fails
 */
export async function updateChatTitle(chatID: string, newTitle: string): Promise<Chat> {
  const supabase = createClient();
  const user = await getCurrentUser();

  const { data: chatData, error: chatError } = await supabase
    .from('chats')
    .update({ title: newTitle })
    .eq('chat_id', chatID)
    .eq('user_id', user.id)
    .select()
    .single();

  if (chatError || !chatData) {
    console.error('Error updating chat:', chatError);
    throw new Error('Failed to update chat title');
  }

  return chatData;
}

/**
 * Deletes a chat and all its messages
 * @param chatID - The ID of the chat to delete
 * @throws Error if deletion fails
 */
export async function deleteChat(chatID: string): Promise<void> {
  const supabase = createClient();
  const user = await getCurrentUser();

  // First delete all messages in the chat
  const { error: messagesError } = await supabase
    .from('messages')
    .delete()
    .eq('chat_id', chatID)
    .eq('user_id', user.id);

  if (messagesError) {
    console.error('Error deleting messages:', messagesError);
    throw new Error('Failed to delete chat messages');
  }

  // Then delete the chat
  const { error: chatError } = await supabase
    .from('chats')
    .delete()
    .eq('chat_id', chatID)
    .eq('user_id', user.id);

  if (chatError) {
    console.error('Error deleting chat:', chatError);
    throw new Error('Failed to delete chat');
  }
}

