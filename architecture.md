# Architecture: `vercel-deployment`

## 1. System Overview

This repository is a single Next.js application that serves two product surfaces:

- Personal site pages (`/`, `/about`, etc.)
- The "Ask Stella" app (`/stella/*`) for authenticated radiology-oriented chat + AI generation

Core stack:

- Framework: Next.js App Router (TypeScript)
- UI: React + Tailwind + shadcn/ui + Radix
- Auth + data persistence: Supabase (Auth + Postgres)
- AI text generation: Google Gemini API
- Medical image lookup: Google Custom Search API

The architecture is mostly BFF-style (frontend + backend in one Next.js codebase), with client components directly calling Supabase for CRUD and server routes handling AI provider calls.

## 2. Top-Level Structure

- `app/`
- `app/layout.tsx`: global shell for non-Stella routes
- `app/stella/layout.tsx`: Stella-specific metadata/layout entry
- `app/stella/page.tsx`: new chat landing input
- `app/stella/[chatID]/page.tsx`: chat detail view (messages + images)
- `app/stella/generate/route.ts`: main generation API endpoint
- `app/stella/confirm/route.ts`: email OTP confirmation callback
- `components/`
- Stella app UI (`chatbox`, `stella-sidebar`, `stella-layout-shell`, forms)
- shadcn/ui primitive components in `components/ui/*`
- `hooks/`
- `use-chats.ts`: chat list fetch lifecycle
- `use-messages.ts`: chat message fetch/polling lifecycle
- `lib/services/`
- `chat-service.ts`: Supabase chat/message CRUD abstraction
- `generate-service.ts`: Gemini + image-search orchestration
- `lib/supabase/`
- `client.ts`: browser Supabase client
- `server.ts`: server Supabase client with cookie bridge
- `proxy.ts`: optional session-refresh middleware helper (currently not wired)
- `lib/supabase/schema.md`
- Human-written schema reference for `chats` and `messages`

## 3. Runtime Component Architecture

### 3.1 Routing and Render Model

- App Router with mixed Server and Client Components.
- Stella pages are mostly client-driven for interactive auth/session access and polling behavior.
- `/stella/generate` is a server route that performs external API calls and DB writes.

### 3.2 Layout Composition

- `app/layout.tsx` applies global theme + conditional header/footer for non-Stella pages.
- Stella routes bypass global header/footer via `components/conditional-layout.tsx`.
- `components/stella-layout-shell.tsx` performs client-side auth check:
  - Unauthenticated: shows `StellaHeader` and content
  - Authenticated: shows `StellaSidebar` + main content area

### 3.3 Data Access Pattern

Two distinct access paths are used:

- Client-to-Supabase direct access for chats/messages CRUD (`chat-service.ts` called from client components/hooks)
- Client-to-Next API route for AI generation (`/stella/generate`), then server-to-Supabase writes

This is a hybrid architecture, not a strict server-only data access model.

## 4. Domain Model

From `lib/supabase/schema.md`:

- `chats`
- PK: `chat_id`
- Ownership: `user_id` (FK to `auth.users.id`)
- Attributes: `title`, `default_task`, `created_at`, `updated_at`

- `messages`
- PK: `message_id`
- Ownership: `user_id` + `chat_id`
- Attributes: `role`, `content`, `meta` (JSONB), `created_at`

`meta` stores operational state and generation artifacts:

- `status` (e.g., `analyzing_task`, `refining`, `generating`, `complete`)
- `task` (`refine`, `diagnostic`, `none`)
- `showImages`
- `images` (search results)
- `latencyMs`
- optional `imageQuery`

## 5. Core Business Flows

### 5.1 New Chat + Initial Prompt

1. User types prompt in `components/chatbox.tsx`.
2. `createChatWithMessage()` creates:
- one `chats` row (with selected default task)
- one `messages` row with `role='user'`
3. Client triggers `POST /stella/generate` with `operation='response'`.
4. Client navigates to `/stella/[chatID]`.

### 5.2 Text Generation Lifecycle (`operation='response'`)

In `app/stella/generate/route.ts`:

1. Authenticates user via Supabase server client.
2. Resolves task:
- explicit UI mode, or
- `Auto` mode via `selectTaskForAutoMode()` (Gemini classifier)
3. Inserts placeholder assistant message with status metadata.
4. Calls `generateReport()` in `generate-service.ts`.
5. Updates placeholder with final assistant text and status `complete`.
6. Updates `chats.updated_at`.

### 5.3 Image Generation Lifecycle (`operation='images'`)

1. Chat page detects completed assistant text + `showImages=true` + no images.
2. Client triggers `POST /stella/generate` with `operation='images'`.
3. Server runs `generateImagesForDraft()`:
- asks Gemini for JSON search query extraction
- runs Google Custom Search image query
4. Server writes image results back into existing assistant message `meta.images`.

### 5.4 Chat Rendering and Polling

In `app/stella/[chatID]/page.tsx`:

- Messages are fetched via `useMessages`.
- UI derives thinking phase from assistant `meta.status`.
- Polling runs every 2s while text/images are pending.
- Chat viewport shows user/assistant timeline; right column shows image results.

## 6. Auth and Session Architecture

Implemented paths:

- Client login/signup/password reset flows via Supabase browser SDK.
- Server-side session read in routes/pages via `lib/supabase/server.ts`.
- Route-level guard behavior is mixed:
- `AuthGuard` is client-side and used for auth pages to redirect authenticated users away from login/signup pages.
- `app/stella/update-password/page.tsx` does server-side user check.

Not fully wired:

- `lib/supabase/proxy.ts` appears intended for middleware-based global protection/session refresh but there is no repo-level `middleware.ts` using it.

## 7. External Integrations

### 7.1 Gemini (Text + Query Extraction)

- Used for:
- task selection in Auto mode
- report refinement / differential generation
- keyword extraction for image search query
- Model endpoint in use: `gemini-2.5-pro`

### 7.2 Google Custom Search (Images)

- query params include `searchType=image`, `num=8`, `safe=active`, medium image size.
- results persisted to message metadata and rendered as source links + images.

## 8. Configuration Surface

Environment variables required for behavior:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GEMINI_API_KEY`
- `SEARCH_API_KEY`
- `SEARCH_CX`

Runtime/config notes:

- `next.config.js` has `eslint.ignoreDuringBuilds = true`.
- `next.config.js` sets `images.unoptimized = true`.
- `lib/config.ts` has `ENABLE_SIGNUP = false` (public signup disabled in UI).

## 9. Operational Characteristics

### 9.1 State and Consistency

- Assistant generation state is encoded in message `meta.status`.
- Placeholder-message approach enables progressive UI feedback.
- Polling-based sync (no realtime subscriptions/websocket/SSE).

### 9.2 Error Handling

- Most server errors are returned as `{ ok: false, error }`.
- Client side logs many errors to console; user-facing error UX is partial/inconsistent.

### 9.3 Security Boundaries

- Ownership checks in chat/message queries use `user_id` filters.
- Schema notes indicate RLS enabled in Supabase.
- API keys remain server-side in generation service.

## 10. Current Architectural Tradeoffs

Strengths:

- Clear separation between UI components, chat data service, and generation service.
- Async generation lifecycle is explicit and inspectable through message metadata.
- Domain model is simple and supports auditability of conversation turns.

Tradeoffs/limitations:

- Heavy client-side data access and state orchestration increase UI complexity.
- Polling introduces latency/load overhead compared with push-based updates.
- Auth/session enforcement is not centralized through middleware.
- `messages.meta` is flexible but weakly typed (`any` usage across layers).

## 11. Request Sequence (Condensed)

Text generation:

1. `Chatbox` -> `createChatWithMessage()` (Supabase)
2. `Chatbox` -> `POST /stella/generate` (`operation='response'`)
3. `generate/route` -> `generate-service` -> Gemini
4. `generate/route` -> Supabase update assistant message
5. `Chat page` polls and renders completion

Image generation:

1. `Chat page` detects text complete and image pending
2. `Chat page` -> `POST /stella/generate` (`operation='images'`)
3. `generate-service` -> Gemini query extraction -> Google Image Search
4. `generate/route` -> Supabase update message `meta.images`
5. `Chat page` polls and renders images

