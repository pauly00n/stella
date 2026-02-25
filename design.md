# Stella System Design (Current + Last 24h Change Record)

## 1. Scope and Source of Truth

This document is a consolidated design record built from:

- `changes.md`
- `completed-changes.md`
- `AGENT_HISTORY.md`
- all git commits in the last 24 hours on `main` (11 commits from 2026-02-19 15:54:12 -0800 to 2026-02-20 10:51:45 -0800)
- current implementation state in key runtime files (`app/stella/generate/route.ts`, `lib/services/generate-service.ts`, `lib/supabase/proxy.ts`, `app/api/stella/chats/*`, hooks, and UI entrypoints)

The goal is to explain the current system design, what changed, why it changed, and tradeoffs.

## 2. Product and System Context

The repository is a single Next.js App Router application with two surfaces:

- Public personal website pages (`/`, `/about`, etc.)
- Authenticated Stella app (`/stella/*`) for radiology-oriented AI-assisted chat

Core integrations:

- Supabase Auth + Postgres for identity and persistence
- Gemini (`gemini-2.5-pro`) for task classification and report generation
- Google Custom Search for image retrieval
- Semantic Scholar search for reference papers

Design principle now used across this codebase:

- Keep UI composition in client components
- keep trust boundaries and data ownership server-side through internal route handlers
- keep runtime contracts explicit via Zod schemas

## 3. Architectural Boundaries

### 3.1 Layering

1. Presentation layer:
- `app/stella/page.tsx`
- `app/stella/[chatID]/page.tsx`
- `components/chatbox.tsx`
- `components/stella-sidebar.tsx`

2. Client orchestration/state layer:
- `hooks/use-chats.ts`
- `hooks/use-messages.ts`
- `hooks/use-chat-orchestration.ts`
- `lib/services/chat-service.ts` (API client abstraction)

3. Server route/API layer:
- `app/api/stella/chats/route.ts`
- `app/api/stella/chats/[chatID]/route.ts`
- `app/api/stella/chats/[chatID]/messages/route.ts`
- `app/stella/generate/route.ts`
- `app/stella/confirm/route.ts`

4. Infrastructure/services layer:
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/proxy.ts`
- `lib/services/generate-service.ts`
- `lib/security/rate-limit.ts`
- `lib/observability/logger.ts`
- `lib/env/server.ts`, `lib/env/client.ts`
- `lib/schemas/chat.ts`

### 3.2 Rationale

- Internal APIs centralize auth checks, ownership checks, validation, and observability.
- Hooks keep UI components thin and mostly render-focused.
- Message-level metadata (`meta`) acts as a persisted state machine for async generation lifecycle.

### 3.3 Tradeoff

- This is still a single-codebase BFF model, not fully decoupled microservices.
- Faster iteration and lower operational complexity were prioritized over strict service separation.

## 4. Route and Runtime Topology

### 4.1 Auth/session protection

- Root `proxy.ts` delegates to `updateSession()` in `lib/supabase/proxy.ts`.
- Stella paths are centrally handled.
- Public Stella routes are allowlisted (login/signup/recovery/error/confirm).
- Protected routes redirect unauthenticated users to `/stella/login?next=...`.
- Auth-entry routes redirect authenticated users back to `/stella`.
- `/stella/generate` is intentionally excluded from redirect logic so it can return JSON `401` for API consumers.

Reasoning:

- One policy point avoids fragmented page-level guards.
- Keeping API auth errors as JSON (not redirects) makes client error handling deterministic.

Tradeoff:

- Middleware logic is simple path-based policy; future complexity (role-based or tenant rules) will need a richer policy model.

### 4.2 Main user flow routes

- `POST /api/stella/chats` creates chat + initial user message.
- `POST /stella/generate` handles three operations:
  - `response` (text differential generation)
  - `images` (image search groups attached to assistant message meta)
  - `papers` (paper lookup groups attached to assistant message meta)
- `GET /api/stella/chats/:chatID/messages` drives chat timeline rendering.

## 5. Data Model and State Encoding

Primary tables (Supabase/Postgres):

- `chats`: owner + title + default task + timestamps
- `messages`: owner + chat link + role + content + `meta` JSON

`messages.meta` currently stores:

- generation status (`analyzing_task`, `generating`, `complete`)
- resolved task (`diagnostic` or `none`)
- images (legacy flat or grouped differential format)
- papers (diagnosis-paper group list)
- showImages flag
- latency measurement
- idempotency key

Rationale:

- Persisting workflow state in `meta` allows resilient refresh/recovery and decouples rendering from ephemeral client-only state.

Tradeoff:

- JSON flexibility improves iteration speed but weakens relational guarantees; validation is enforced at application level (Zod) instead of DB constraints.

## 6. Generation Pipeline Design

### 6.1 Text generation (`operation=response`)

Flow:

1. Request payload validated by `GenerateForChatBodySchema`.
2. Authenticated user required.
3. Rate limit enforced per scope/user/IP.
4. Optional idempotency lookup (existing assistant message containing same key in `meta`).
5. Task resolution:
- `Auto` mode => Gemini classifier (`diagnostic` or `none`)
- specific UI categories map to `diagnostic`
6. Placeholder assistant message inserted with status metadata.
7. Gemini diagnostic prompt generated with category bias.
8. Placeholder updated to final content + final metadata.
9. `chats.updated_at` bumped.

Rationale:

- Placeholder-first write pattern gives immediate progress state and enables polling/realtime to show intermediate phases.
- Idempotency reduces duplicate provider calls from retries and navigation races.

Tradeoff:

- Extra writes (insert + update) increase DB operations but improve UX and correctness.

### 6.2 Image augmentation (`operation=images`)

Flow:

1. Validate/auth/rate-limit.
2. Resolve draft (request draft or latest user message fallback).
3. Gemini extracts top differential search queries (JSON array).
4. Google Custom Search runs per differential, grouped results are stored in `meta.images`.

Rationale:

- Grouping images by differential keeps image evidence tied to reasoning structure instead of mixed flat results.

Tradeoff:

- External search quality depends on generated query quality; brittle JSON extraction remains a failure point.

### 6.3 Paper augmentation (`operation=papers`)

Flow:

1. Extract top differential names from generated markdown via regex.
2. Query Semantic Scholar for each diagnosis.
3. Attach grouped citation payload to `meta.papers`.

Rationale:

- Adds lightweight evidence links without blocking the main response path.

Tradeoff:

- Regex-based diagnosis extraction is format-sensitive; if output formatting drifts, recall drops.

## 7. Client Orchestration Design

### 7.1 Message delivery model

- `use-messages.ts` now uses hybrid delivery:
  - Supabase Realtime subscription for push updates
  - polling fallback while pending (`2.0s` without realtime, `2.5s` with realtime)

Rationale:

- Push improves responsiveness.
- Polling remains as reliability backstop for missed events/transient connection issues.

Tradeoff:

- Duplicate refresh traffic can still occur under high churn; correctness was prioritized over minimal network chatter.

### 7.2 Central orchestration hook

- `use-chat-orchestration.ts` consolidates:
  - chat metadata fetch
  - thinking phase derivation
  - pending assistant/pending image/pending paper calculations
  - image and paper trigger effects
  - orchestration-level error state

Rationale:

- Moves non-presentational logic out of `app/stella/[chatID]/page.tsx` to improve explainability and maintainability.

Tradeoff:

- Hook is now high-responsibility; future growth may require splitting into smaller sub-hooks.

## 8. Contract Safety and Validation

`lib/schemas/chat.ts` provides runtime-enforced contracts for:

- task enums
- chat create/update payloads
- generate payloads
- message meta object

Rationale:

- Runtime validation prevents malformed payloads from crossing trust boundaries.
- Inferred TS types align compile-time and runtime shape expectations.

Tradeoff:

- Schema upkeep adds maintenance overhead; changes to payload/meta shape require coordinated updates.

## 9. Observability and Error Strategy

### 9.1 Logging

- Structured JSON logger in `lib/observability/logger.ts`.
- Request-scoped context includes request id, route, and optional user/chat metadata.
- Route handlers and generation service use structured events instead of ad hoc console text.

Rationale:

- Machine-parsable logs are required for useful production triage and alerting.

Tradeoff:

- Stack traces and event volume can grow quickly; no sampling policy yet.

### 9.2 User-visible error handling

- UI and hooks now favor surfaced error states over silent console-only failures.
- Sidebar and chat page render operational errors directly.

Rationale:

- Hidden failures degrade trust and make support/debugging harder.

Tradeoff:

- Error messages are still basic; UX copy and recoverability can be improved.

## 10. Security and Abuse Controls

### 10.1 Implemented controls

- Auth enforcement in middleware + route handlers.
- Ownership filters (`user_id`) on chat/message reads and writes.
- Input validation with Zod at API boundaries.
- Per-operation rate limiting on `/stella/generate`:
  - `generate:response`
  - `generate:images`

### 10.2 Current limiter backend tradeoff

- Limiter is currently in-memory, per-instance (`Map`).
- Good for immediate guardrails, not globally consistent under serverless horizontal scaling.
- TODO in code explicitly calls for distributed backend (Redis or Supabase atomic counter approach).

## 11. Config and Secret Model

### 11.1 Startup validation

- `lib/env/server.ts` parses required server env vars at startup.
- `lib/env/client.ts` validates public client env vars.
- server module hard-fails if imported in browser context.

Rationale:

- Fail-fast startup catches misconfiguration before runtime traffic.
- Explicit server/client boundary reduces accidental secret leakage.

### 11.2 API key transmission hardening

- Gemini API key now sent as `x-goog-api-key` header (not URL query param).

Rationale:

- Reduces risk of key exposure in logs, proxies, and URL analytics systems.

## 12. Last 24 Hours: Commit-by-Commit Design Impact

All commits observed in window ending 2026-02-20:

1. `bee7b633` (2026-02-19 15:54:12 -0800) - fixing dependencies  
Impact:
- CI added, scripts aligned, architecture/change docs introduced, build tooling cleanup.
Why:
- Establish reliable baseline and enforce reproducible quality gates.

2. `c54767f9` (2026-02-19 17:05:17 -0800) - auth + typing  
Impact:
- server-owned chat/message APIs, centralized proxy auth policy, Zod schema introduction, auth flow corrections.
Why:
- Remove fragmented auth and weak typing in core flows.

3. `0f465d6f` (2026-02-19 22:33:37 -0800) - upgraded logging w structured events  
Impact:
- structured logs across routes/services, realtime improvements, roadmap updates.
Why:
- Operations visibility and failure diagnosability.

4. `e6785ce2` (2026-02-19 23:02:42 -0800) - rate limits  
Impact:
- generate endpoint fixed-window guardrails with standard rate-limit headers.
Why:
- basic abuse/throttle control before expensive provider calls.

5. `344e0b84` (2026-02-19 23:27:20 -0800) - env validation + server only env secrets  
Impact:
- startup env contracts, client/server env separation.
Why:
- misconfiguration and secret-boundary hardening.

6. `51b73db8` (2026-02-20 07:20:02 -0800) - markdown text + [chatid] hook refactoring  
Impact:
- major chat orchestration hook extraction; user-visible UI error handling; docs/history updates.
Why:
- improve explainability and reduce page-level logic fragmentation.

7. `6c2f2ee5` (2026-02-20 08:00:21 -0800) - draft report removal, overhaul of differential diagnoses  
Impact:
- substantial generation logic simplification/rewrite, schema and UI updates.
Why:
- improve report quality/control and remove redundant/legacy generation paths.

8. `0b36a40f` (2026-02-20 08:11:56 -0800) - pnpm fixed  
Impact:
- lockfile normalization update (`pnpm-lock.yaml`).
Why:
- dependency reproducibility for pnpm consumers.

9. `775452d0` (2026-02-20 08:28:27 -0800) - ui  
Impact:
- targeted chat page UI adjustment.

10. `1cf5f16e` (2026-02-20 10:49:27 -0800) - gemini key in header, not as query param  
Impact:
- key transport hardening; updates to generation/orchestration/rate-limit/schema files.
Why:
- security and consistency improvements around provider access.

11. `3800e942` (2026-02-20 10:51:45 -0800) - fixed pattern matching  
Impact:
- follow-up fix in generation service parsing/matching logic.
Why:
- correct content parsing behavior after prior generation changes.

## 13. Major Design Decisions and Tradeoffs

1. Centralized auth in proxy + route enforcement  
Decision:
- prefer one policy surface and server-side checks.
Tradeoff:
- path allowlist maintenance required.

2. Internal API boundary for chat/message CRUD  
Decision:
- migrate away from direct client Supabase CRUD for core entities.
Tradeoff:
- introduces extra hop but standardizes security/validation.

3. Placeholder message state machine  
Decision:
- persist progress in DB meta.
Tradeoff:
- additional writes and meta schema complexity.

4. Hybrid realtime + polling  
Decision:
- optimize for delivery reliability.
Tradeoff:
- network overhead remains higher than pure push.

5. In-memory rate limiting first  
Decision:
- ship immediate abuse guard with minimal infrastructure.
Tradeoff:
- not globally strict across instances; must migrate for production scale.

6. Flexible `meta` JSON with runtime Zod parsing  
Decision:
- prioritize rapid evolution of async artifacts (images/papers/status/idempotency).
Tradeoff:
- looser DB-level guarantees vs explicit normalized tables.

## 14. Remaining Gaps (From Project Roadmap + Current Code Reality)

Still open/high priority:

- dependency/toolchain unification (single lockfile policy, aligned Next/React/eslint matrix)
- test depth (unit/integration/E2E beyond lint/typecheck/build)
- distributed/global rate limiter backend
- richer observability (metrics sink, dashboards, alert thresholds, tracing)
- moderation/safety policy checks for clinical-risk outputs
- DB migration discipline (tracked SQL migrations + RLS verification tests)

## 15. Definition of Current State

As of 2026-02-20, the system is materially improved in:

- trust boundaries (server-owned APIs + centralized auth behavior)
- runtime safety (schema validation + env validation)
- operational baseline (structured logging + CI checks)
- generation reliability patterns (idempotency + retry/timeout + hybrid update model)

But it is not yet at full production maturity until testing depth, distributed abuse controls, and observability/migration operations are completed.
