# Supabase Database Schema

This file documents the database tables in the Supabase public schema.

## Tables

### Table 1: chats
**Description:**  
Stores conversation-level metadata. Each row represents a single user-owned chat thread. No message content is stored here.

**Columns:**
- `chat_id` (uuid, PK) – Unique identifier for the chat.
- `user_id` (uuid, FK → auth.users.id) – Owner of the chat.
- `title` (text) – Optional human-readable title for the conversation.
- `default_task` (text) – Default workflow for the chat (`auto`, `refine`, `diagnostic`).
- `created_at` (timestamptz) – Time the chat was created.
- `updated_at` (timestamptz) – Time of last activity in the chat.

**Relationships:**
- `user_id` references `auth.users(id)`
- One-to-many relationship with `messages.chat_id`

---

### Table 2: messages
**Description:**  
Stores all user inputs and AI outputs within a chat. Each row is a single turn in the conversation.

**Columns:**
- `message_id` (uuid, PK) – Unique identifier for the message.
- `chat_id` (uuid, FK → chats.chat_id) – Chat this message belongs to.
- `user_id` (uuid, FK → auth.users.id) – Owner of the message.
- `role` (text) – Message type (`user`, `assistant`, `system`, etc.).
- `content` (text) – The raw message text.
- `meta` (jsonb) – Structured metadata for the message (task used, anatomy, images, search queries, model info, etc.).
- `created_at` (timestamptz) – Time the message was created.

**Relationships:**
- `chat_id` references `chats(chat_id)`
- `user_id` references `auth.users(id)`

---

## Notes

- Row Level Security (RLS) is enabled on both tables.
- Access is restricted so users may only read and modify their own chats and messages.
- The `meta` column in `messages` is stored as `jsonb` to support efficient querying and indexing of structured AI output.
- Indexes should exist on:
  - `chats(user_id, updated_at)`
  - `messages(chat_id, created_at)`
  - `messages(meta)` using a GIN index for metadata queries.