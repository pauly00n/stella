# Completed Changes

This file records all completed changes made in this session.

## 1. Architecture Documentation

- Added `architecture.md` with full system architecture coverage:
  - app boundaries, routes, runtime flow, auth model
  - data model (`chats`, `messages`, `meta`)
  - generation flow (text + images)
  - integration dependencies and operational tradeoffs

## 2. Pipeline and Tooling Hardening

### `package.json`
- Updated scripts:
  - `lint`: `eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0`
  - `typecheck`: `tsc --noEmit`
  - `build`: `next build --webpack`

### `next.config.js`
- Removed deprecated `eslint` config block that was invalid under current Next setup.

### `.eslintrc.json`
- Added rule override: `react/no-unescaped-entities: off` for prose-heavy content pages.

### `app/layout.tsx`
- Removed `next/font/google` Inter import and usage to avoid external font fetch dependency during build.

### CI
- Added `.github/workflows/ci.yml` with required checks:
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Enabled concurrency cancellation in CI workflow.

## 3. Auth Route Corrections and Recovery Flow Fixes

### Added route constants
- Added `lib/auth/routes.ts` with shared `AUTH_ROUTES` and `sanitizeNextPath`.
- Later removed unused `buildConfirmRedirect` and `AUTH_ROUTES.confirm` for dead-code cleanup.

### Forgot password/login route fixes
- `components/forgot-password-form.tsx`:
  - Fixed reset redirect target to `/stella/update-password`.
  - Fixed login link routing to `/stella/login`.
  - Added "Back to login" link in success state.

### Update password flow fixes
- `components/update-password-form.tsx`:
  - Redirect after successful password update to `/stella`.
  - Added recovery-session bootstrapping from URL params:
    - `exchangeCodeForSession(code)` support
    - `verifyOtp({ token_hash, type })` support
  - Added session existence checks before `updateUser`.
  - Added bootstrap loading state (`Validating reset link...`).
  - Renamed handler `handleForgotPassword` -> `handleUpdatePassword`.

### Page-level corrections
- `app/stella/update-password/page.tsx`:
  - Removed server-side hard auth gate that broke recovery-link landing.
- `app/stella/confirm/route.ts`:
  - Switched error redirects to `/stella/error`.
  - URL-encoded error messages.
  - Sanitized `next` path handling.
- `app/stella/error/page.tsx`:
  - Fixed rendering so error message from query param is actually displayed.

### Signup redirect consistency
- `components/sign-up-form.tsx`:
  - Restored direct redirect target to `/stella` for signup email flow.

## 4. Centralized Session Enforcement (Auth Policy Unification)

### Core auth policy
- Reworked `lib/supabase/proxy.ts` to enforce centralized route policy:
  - Public Stella allowlist maintained in one place.
  - Protected Stella routes redirect unauthenticated users to login with `next` query.
  - Authenticated users redirected away from auth-entry routes (`/stella/login`, `/stella/sign-up`, `/stella/forgot-password`).
  - `/stella/generate` excluded from middleware redirects so API can return 401 JSON.

### Proxy wiring
- Added root `proxy.ts` (Next 16 convention) that delegates to `updateSession`.
- Removed transient `middleware.ts` implementation after Next warning; replaced with `proxy.ts`.

### Removed fragmented client-side auth wrappers
- Removed `AuthGuard` usage from:
  - `app/stella/login/page.tsx`
  - `app/stella/sign-up/page.tsx`
  - `app/stella/forgot-password/page.tsx`
  - `app/stella/sign-up-success/page.tsx`
  - `app/stella/sign-up-exists/page.tsx`
- Deleted now-unused `components/auth-guard.tsx`.

## 5. Data Access Refactor (Chats/Messages to Server-Owned Boundary)

### Added server API routes
- `app/api/stella/chats/route.ts`
  - `GET`: list chats for current user
  - `POST`: create chat + initial user message
- `app/api/stella/chats/[chatID]/route.ts`
  - `GET`: fetch chat by ID
  - `PATCH`: update chat title
  - `DELETE`: delete messages then chat
- `app/api/stella/chats/[chatID]/messages/route.ts`
  - `GET`: fetch messages by chat

### Rewired service layer
- `lib/services/chat-service.ts`:
  - removed direct client Supabase DB CRUD calls
  - now calls `/api/stella/chats*` endpoints via `fetch`
  - preserved exported function signatures used by UI/hooks

## 6. Zod Runtime Validation + Typed Schemas

### Added shared schema module
- Added `lib/schemas/chat.ts` with:
  - `TaskTypeSchema`, `DefaultTaskSchema`, `InternalTaskSchema`
  - `ImageMetaSchema`, `MessageMetaSchema`
  - `CreateChatBodySchema`, `UpdateChatTitleBodySchema`, `GenerateForChatBodySchema`
  - inferred types exported via `z.infer`

### Route-level validation
- `app/api/stella/chats/route.ts`:
  - validates request body with `CreateChatBodySchema.safeParse`
- `app/api/stella/chats/[chatID]/route.ts`:
  - validates request body with `UpdateChatTitleBodySchema.safeParse`
- `app/stella/generate/route.ts`:
  - validates request body with `GenerateForChatBodySchema.safeParse`
  - parses and validates existing message `meta` with `MessageMetaSchema` before merge

### Typed metadata propagation
- `lib/services/chat-service.ts`:
  - `Message.meta` changed from `any | null` to `MessageMeta | null`
- `app/stella/[chatID]/page.tsx`:
  - added `getMessageMeta()` using `MessageMetaSchema`
  - replaced multiple `as any` meta usages with parsed typed meta access

### Additional cleanup in touched paths
- `app/stella/generate/route.ts`:
  - removed `any[]` for inserted message tracking in favor of typed message id shape
- `lib/services/chat-service.ts`:
  - removed `any` in API error parsing logic

## 7. Roadmap / Tracking Docs Updates

### `changes.md`
- Added persistent explainability standard section (design/line-by-line rationale requirement).
- Removed completed sections as work landed:
  - CI/pipeline hardening
  - auth and route correctness
  - centralized session enforcement
  - data access architecture migration
- Renumbered remaining roadmap sections accordingly.

### New historical summary
- Added this file: `completed-changes.md`.

## 8. Validation Status During Session

The modified codebase was repeatedly validated after major changes with:
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Final state at time of this summary: all three commands pass.

## 9. Reliability and Async Processing Upgrades

### Hybrid push + polling updates
- `hooks/use-messages.ts`
  - Added Supabase Realtime subscription for `messages` changes by `chat_id`.
  - Exposed `realtimeConnected` status to callers.
- `app/stella/[chatID]/page.tsx`
  - Updated polling strategy to hybrid mode:
    - Realtime push is used when available.
    - Polling still runs while pending (reliability backstop for intermediate updates).
    - Adaptive interval (`2500ms` when realtime connected, `2000ms` otherwise).

### Idempotency for generation requests
- `components/chatbox.tsx`
  - Sends `idempotencyKey` (`crypto.randomUUID()`) on `response` generation calls.
- `lib/schemas/chat.ts`
  - Added `idempotencyKey` support in generate request/meta schema.
- `app/stella/generate/route.ts`
  - Added idempotency lookup path (`meta.idempotencyKey`) before generation.
  - Returns existing assistant message result when duplicate key is detected.
  - Persists `idempotencyKey` in assistant message metadata.

### Timeout + retry/backoff for provider calls
- `lib/services/generate-service.ts`
  - Added `fetchWithRetry` helper with:
    - Abort timeout
    - bounded exponential backoff
    - retry on transient status codes / transport errors
  - Routed Gemini and Google image-search requests through this helper.

## 10. Observability and Operations Upgrade

### Structured server logging
- Added `lib/observability/logger.ts`:
  - JSON log entries with stable fields (`timestamp`, `level`, `event`, context).
  - Safe error serialization.
  - Request-scoped logger API.
- Integrated structured logging into:
  - `app/stella/generate/route.ts`
  - `app/api/stella/chats/route.ts`
  - `app/api/stella/chats/[chatID]/route.ts`
  - `app/api/stella/chats/[chatID]/messages/route.ts`
- Added request IDs (`x-request-id` passthrough or generated) in route logging context.

## 11. Security and Abuse Controls (Phase 1)

### Rate limiting on generation endpoint
- Added `lib/security/rate-limit.ts`:
  - Fixed-window, in-memory per-instance counters.
  - operation scopes:
    - `generate:response`
    - `generate:images`
- Integrated in `app/stella/generate/route.ts`:
  - Enforces limits before provider work starts.
  - Configurable via env:
    - `RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE`
    - `RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE`
  - Returns `429` with:
    - `Retry-After`
    - `X-RateLimit-Limit`
    - `X-RateLimit-Remaining`
    - `X-RateLimit-Reset`
  - Emits structured `generate.rate_limited` warning event.

## 12. Config and Secret Hygiene Hardening

### Startup env validation and server-only secret boundary
- Added startup validation for required server environment variables (including generation and security settings).
- Why:
  - Fail fast at boot instead of failing at runtime under live traffic.
  - Prevent accidental deploys with missing or malformed env values.
- How:
  - Centralized env parsing in server env module using schema validation.
  - Explicitly separated server-only variables from public client env usage.
  - Updated code paths to import typed server env object rather than reading raw `process.env` ad hoc.

## 13. Chat Page Orchestration Refactor + User-Visible Error Handling

### New orchestration hook
- Added `hooks/use-chat-orchestration.ts`.
- Why:
  - `app/stella/[chatID]/page.tsx` had fragmented orchestration state and effects, which made behavior hard to reason about and explain.
  - Consolidation improves maintainability and line-by-line explainability.
- How:
  - Moved chat metadata fetch, pending assistant detection, thinking phase derivation, image generation trigger, and hybrid polling decisions into one hook.
  - Hook now returns typed orchestration outputs consumed by the page.

### Chat page simplification
- Updated `app/stella/[chatID]/page.tsx` to consume `useChatOrchestration`.
- Why:
  - Keep page component presentational and focused on rendering.
- How:
  - Removed in-page orchestration effects/memos and replaced them with hook return values.
  - Added combined error rendering for message-fetch + orchestration failures.

### Removed UI debug logs and surfaced errors to users
- Updated `components/chatbox.tsx`:
  - Removed debug `console.log`/`console.error`.
  - Added inline error state rendering.
  - Changed generate call from silent fire-and-forget to awaited response with user-facing error handling and auth redirect on 401.
- Updated `components/sign-up-form.tsx`:
  - Removed debug sign-up logs.
- Updated `components/stella-sidebar.tsx`:
  - Added visible `sidebarError` message area.
  - Rename/delete failures now display user-visible errors instead of hidden console errors.
- Updated `hooks/use-chats.ts` and `hooks/use-messages.ts`:
  - Removed console error logging in favor of existing exposed hook `error` state that UI can render.
- Why:
  - User-facing failures should be visible and actionable.
  - Debug logs in client flows leak noise and hide failures from users.
- How:
  - Introduced/used local error state and rendered it in the relevant components.
  - Removed non-essential console logging in UI/hook flows.

## 14. Structured Logging Migration in Generation Service

- Updated `lib/services/generate-service.ts` to replace remaining server-side `console.*` calls with structured logger events.
- Why:
  - Standardized machine-parsable logs for operations, alerting, and debugging.
  - Consistent log schema across routes/services.
- How:
  - Imported request logger factory and created service logger context.
  - Replaced parse/search/report error logs with stable event names and structured context.
  - Added safe response preview/length fields for task-selection parse failures instead of dumping full raw content.
