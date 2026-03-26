# BLACKBOX.md — Stella / vercel-deployment

Agent context file. Describes the project, conventions, and operational details for use in future sessions.

---

## 1. Project Overview

A single **Next.js App Router** (TypeScript) application that serves two surfaces:

| Surface | Path | Description |
|---|---|---|
| Personal site | `/`, `/about` | Public-facing pages |
| Stella app | `/stella/*` | Authenticated radiology-oriented AI chat |

**Core stack:**
- **Framework:** Next.js App Router (TypeScript, `strict: true`)
- **UI:** React 18 + Tailwind CSS 3.3 + shadcn/ui + Radix UI primitives
- **Auth + DB:** Supabase (Auth + Postgres with RLS)
- **AI:** Google Gemini (`gemini-2.5-pro`) via `GEMINI_API_KEY`
- **Image search:** Google Custom Search API (`SEARCH_API_KEY`, `SEARCH_CX`)
- **Paper search:** Semantic Scholar (no key required)
- **Validation:** Zod schemas in `lib/schemas/chat.ts`
- **Logging:** Structured JSON logger in `lib/observability/logger.ts`

---

## 2. Environment Variables

Defined in `.env.example`. Required at runtime:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
GEMINI_API_KEY=
SEARCH_API_KEY=
SEARCH_CX=
```

Optional (rate limiting):
```
RATE_LIMIT_GENERATE_RESPONSE_PER_MINUTE=   # default: 20
RATE_LIMIT_GENERATE_IMAGES_PER_MINUTE=     # default: 10
```

Env is validated at startup via `lib/env/server.ts` and `lib/env/client.ts`.

---

## 3. Key Commands

```bash
npm run dev        # Start dev server (Next.js)
npm run build      # Production build (webpack mode: next build --webpack)
npm run start      # Start production server
npm run lint       # ESLint, zero warnings allowed
npm run typecheck  # tsc --noEmit (strict mode)
```

> **Note:** `eslint.ignoreDuringBuilds = true` in `next.config.js` — lint errors won't fail builds, but `npm run lint` enforces zero warnings.

---

## 4. Directory Structure

```
app/
  layout.tsx                    # Global shell (non-Stella routes)
  page.tsx                      # Personal site home
  about/                        # Personal site about page
  stella/
    layout.tsx                  # Stella metadata/layout entry
    page.tsx                    # New chat landing (chatbox input)
    [chatID]/page.tsx           # Chat detail view (messages + images + papers)
    generate/route.ts           # Main AI generation API endpoint (POST)
    confirm/route.ts            # Email OTP confirmation callback
    login/, sign-up/, forgot-password/, update-password/, error/
  api/stella/
    chats/route.ts              # POST (create chat+message), GET (list chats)
    chats/[chatID]/route.ts     # GET, PATCH (title), DELETE
    chats/[chatID]/messages/route.ts  # GET messages

components/
  chatbox.tsx                   # Main prompt input + task selector
  stella-layout-shell.tsx       # Client-side auth check → sidebar or header
  stella-sidebar.tsx            # Authenticated sidebar (chat list)
  stella-header.tsx             # Unauthenticated header
  # conditional-layout.tsx removed — layout handled by stella-layout-shell.tsx
  chat-loading-skeleton.tsx     # Loading state for chat view
  login-form.tsx, sign-up-form.tsx, forgot-password-form.tsx, update-password-form.tsx
  ui/                           # shadcn/ui primitives (do not edit manually)

hooks/
  use-chats.ts                  # Chat list fetch lifecycle
  use-messages.ts               # Message fetch + Supabase Realtime + polling fallback
  use-chat-orchestration.ts     # Central orchestration: thinking phase, image/paper triggers

lib/
  config.ts                     # ENABLE_SIGNUP = false (public signup disabled)
  utils.ts                      # cn() Tailwind class merge utility
  schemas/chat.ts               # All Zod schemas + inferred TS types
  services/
    chat-service.ts             # API client abstraction for chats/messages (fetch wrappers)
    generate-service.ts         # Gemini + image search + paper search orchestration
  supabase/
    client.ts                   # Browser Supabase client
    server.ts                   # Server Supabase client (cookie bridge)
    proxy.ts                    # Session-refresh middleware helper
    schema.md                   # Human-written DB schema reference
  env/
    server.ts                   # Server-side env validation
    client.ts                   # Client-side env validation
  observability/logger.ts       # Structured JSON logger (createRequestLogger)
  security/rate-limit.ts        # In-process rate limiter (⚠ not persistent across cold starts)
  auth/                         # Auth helpers

proxy.ts                        # Root middleware entry — delegates to lib/supabase/proxy.ts
```

---

## 5. Architecture Patterns

### 5.1 Layering

1. **Presentation** — `app/stella/page.tsx`, `app/stella/[chatID]/page.tsx`, `components/chatbox.tsx`
2. **Client orchestration** — `hooks/use-chat-orchestration.ts`, `hooks/use-messages.ts`, `lib/services/chat-service.ts` (fetch wrappers, not direct Supabase)
3. **Server API routes** — `app/api/stella/chats/**`, `app/stella/generate/route.ts`
4. **Infrastructure** — `lib/supabase/*`, `lib/services/generate-service.ts`, `lib/observability`, `lib/security`, `lib/env`

### 5.2 Data Access

- **All client→DB access goes through internal API routes** (`/api/stella/chats/*`), not direct Supabase calls from the browser. `chat-service.ts` is a typed fetch wrapper around these routes.
- **AI generation** goes through `POST /stella/generate` (server route → Gemini/Search APIs → Supabase write).
- Server routes use `lib/supabase/server.ts` (cookie-based session).

### 5.3 Auth / Session

- Middleware in `proxy.ts` → `lib/supabase/proxy.ts` handles session refresh and route protection centrally.
- Protected Stella routes redirect unauthenticated users to `/stella/login?next=...`.
- `/stella/generate` returns JSON `401` (not a redirect) so client error handling is deterministic.
- `lib/config.ts`: `ENABLE_SIGNUP = false` — public signup is disabled in UI.

### 5.4 Generation Pipeline (`POST /stella/generate`)

Three operations dispatched by `operation` field:

| Operation | Description |
|---|---|
| `response` | Text generation via Gemini. Inserts placeholder message → updates with result. |
| `images` | Grouped image search via Google Custom Search. Attaches to `meta.images`. |
| `papers` | Semantic Scholar lookup per differential. Attaches to `meta.papers`. |

**Placeholder-first pattern:** For `response`, a placeholder assistant message is inserted immediately with `meta.status = "analyzing_task"` or `"generating"`, then updated to `"complete"` when done. This enables polling-based progress UI.

**Idempotency:** `response` operation accepts an `idempotencyKey`; duplicate requests return the existing message.

### 5.5 Message Metadata (`meta` JSONB)

The `messages.meta` column is the persisted state machine for async generation:

```ts
// From lib/schemas/chat.ts — MessageMetaSchema
{
  status?: "analyzing_task" | "generating" | "complete"
  task?: "diagnostic" | "none" | null
  showImages?: boolean
  images?: DifferentialGroup[]   // grouped by differential name
  papers?: DiagnosisPaperGroup[] // one paper per diagnosis
  latencyMs?: number
  imageQuery?: string
  idempotencyKey?: string
}
```

### 5.6 Client Polling + Realtime

`use-messages.ts` uses **hybrid delivery**:
- Supabase Realtime subscription (push)
- Polling fallback: every 2.0s (no realtime) / 2.5s (with realtime) while pending

`use-chat-orchestration.ts` derives `thinkingPhase` (`"analyzing" | "generating" | "searching" | null`) and triggers image/paper fetch effects automatically when text generation completes.

---

## 6. Domain Model

**`chats`** table:
- `chat_id` (PK), `user_id` (FK → auth.users), `title`, `default_task`, `created_at`, `updated_at`

**`messages`** table:
- `message_id` (PK), `chat_id`, `user_id`, `role` (`user` | `assistant`), `content`, `meta` (JSONB), `created_at`

**Task types** (from `lib/schemas/chat.ts`):
- UI: `Auto | Tumor | Arthritis | Trauma | Infection | AVN | Inflammatory | Developmental | Vascular`
- Internal (resolved): `diagnostic | none`

---

## 7. Conventions

### TypeScript
- `strict: true` — no implicit any, strict null checks enforced.
- All payload shapes defined as Zod schemas in `lib/schemas/chat.ts`; TS types are inferred from schemas (`z.infer<typeof ...>`).
- Path alias: `@/` maps to project root.

### Components
- shadcn/ui components live in `components/ui/` — **do not edit manually**; use `npx shadcn@latest add <component>`.
- Client components that use hooks must have `"use client"` directive.
- `app/globals.css` — **do not modify**; it will break the app.

### Styling
- Tailwind CSS 3.3 with CSS variable-based color tokens (defined in `globals.css`).
- Dark mode via `class` strategy (`next-themes`).
- `cn()` utility from `lib/utils.ts` for conditional class merging.
- `@tailwindcss/typography` plugin used for markdown rendering.

### API Routes
- All routes return `{ ok: true, ... }` on success or `{ ok: false, error: string }` on failure.
- Validate request bodies with Zod `.safeParse()` before any logic.
- Auth check via `supabase.auth.getUser()` at the top of every protected route.
- Use `createRequestLogger()` for structured logging in server routes.

### Logging
- `createRequestLogger(baseContext)` returns `{ info, warn, error }`.
- All log output is structured JSON to stdout/stderr.
- Include `requestId`, `route`, `userId`, `chatId` in base context where available.

### Rate Limiting
- `checkRateLimit()` in `lib/security/rate-limit.ts`.
- ⚠️ Current implementation is **in-process only** (Map) — resets on cold start. Not effective across Vercel serverless instances. Needs Upstash Redis or Supabase RPC before scaling.

---

## 8. Key Files to Know

| File | Purpose |
|---|---|
| `lib/schemas/chat.ts` | Single source of truth for all payload/meta types |
| `lib/services/generate-service.ts` | Gemini + image search + paper search logic |
| `lib/services/chat-service.ts` | All client-side API calls (typed fetch wrappers) |
| `app/stella/generate/route.ts` | Main AI generation endpoint (all three operations) |
| `hooks/use-chat-orchestration.ts` | Central client orchestration hook |
| `lib/supabase/schema.md` | DB schema reference |
| `architecture.md` | High-level architecture doc |
| `design.md` | Detailed design record (last 24h changes, rationale, tradeoffs) |
| `changes.md` / `completed-changes.md` | Change log |

---

## 9. Known Limitations / TODOs

- **Rate limiting** is in-process only — not effective across serverless instances. Replace with Upstash Redis.
- **`messages.meta`** is flexible JSONB — validated at app layer (Zod) but no DB-level constraints.
- **Polling** introduces latency/load overhead; Realtime is a partial mitigation.
- **`proxy.ts`** at root is the middleware entry but is named `proxy.ts` not `middleware.ts` — verify Next.js picks it up correctly for the project's Next version.
- **`ENABLE_SIGNUP = false`** in `lib/config.ts` — sign-up UI is hidden; new users must be provisioned manually or this flag toggled.
- **Image search quality** depends on Gemini-generated query quality; JSON extraction from Gemini output is a known brittle point.

---

## 10. Industry-Level Standards Audit

*Audited: 2026-02-22. Covers testing, observability, security, rate limiting, performance, CI/CD, error handling, accessibility, documentation, data integrity, and clinical safety.*

### 10.1 Testing

**Current state:** Zero test files. No test runner (`jest`, `vitest`, `playwright`) is installed. `testing-strategy.md` describes the target model but none of it is implemented. CI gates on lint + typecheck + build only.

**Gaps & actions:**
- Install `vitest` + `@testing-library/react` for unit/component tests; `playwright` for E2E.
- Write unit tests first (no mocking needed) for: `sanitizeNextPath` (`lib/auth/routes.ts`), `buildWindowKey`/`calcResetAt` (`lib/security/rate-limit.ts`), `mapUiModeToInternalTask` (`app/stella/generate/route.ts`), and all Zod schemas in `lib/schemas/chat.ts`.
- Add route integration tests using `next-test-api-route-handler` with mocked Supabase clients for all routes under `app/api/stella/chats/` and `app/stella/generate/`.
- Add E2E tests (Playwright) covering the auth redirect logic in `lib/supabase/proxy.ts` — the `PUBLIC_STELLA_ROUTES` allowlist and the JSON-401 exclusion for `/stella/generate`.
- Add a `test` script to `package.json` and a `test` step to `.github/workflows/ci.yml` before `build`.

---

### 10.2 Observability

**Current state:** `lib/observability/logger.ts` emits structured JSON to `console.log/warn/error`. Logs are ephemeral in Vercel's runtime log viewer — not queryable, not alertable. No metrics, no tracing, no alerting. The module-level logger in `generate-service.ts` loses per-request correlation in concurrent serverless invocations.

**Gaps & actions:**
- **Wire a log sink.** Axiom (native Vercel integration) or Logtail (Better Stack) both accept structured JSON and have free tiers. Without this, all production observability data is ephemeral.
- **Pass the request-scoped logger** (or at minimum `requestId`) into `generateReport`, `generateImagesForDraft`, and `searchPapersForContent` as a parameter instead of using the module-level logger.
- **Add OpenTelemetry** via `instrumentation.ts` (Next.js first-class support) to propagate trace context to Gemini and Supabase calls.
- **Define alert thresholds:** error rate > 5% over 5 min, p95 latency > 30s, rate limit hit rate > 20% of requests.

---

### 10.3 Security

**Current state:** Zod validation at API boundaries, ownership filters on all DB queries, API keys server-side only. Several critical gaps exist.

**Gaps & actions (ordered by severity):**

1. ~~**`middleware.ts` does not exist — `proxy.ts` is never called.**~~ **Resolved:** Next.js 16 uses `proxy.ts` (with `export async function proxy`) as the middleware convention, replacing the old `middleware.ts` naming. The current `proxy.ts` at the project root is correct and active.

2. **No security headers.** `next.config.js` sets no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. Add these via the `headers()` async function in `next.config.js`.

3. **Prompt injection is unmitigated.** User-supplied `draft` is interpolated directly into Gemini prompts in `generate-service.ts`. Wrap user content in a clearly delimited block and instruct the model to treat it as untrusted input.

4. **Internal error messages leaked to clients.** The top-level catch in `generate/route.ts` returns `err.message` directly. Replace with a generic `'An unexpected error occurred'` and log the full error server-side.

5. **`x-forwarded-for` is spoofable.** Use `request.headers.get('x-real-ip')` (Vercel's trusted header) for IP extraction instead of `x-forwarded-for`.

6. **Zod validation errors are not logged.** When `parsedBody.success === false`, log `parsedBody.error.flatten()` at `warn` level server-side before returning the 400.

7. **No `max` on `messageContent`** in `CreateChatBodySchema`. Add `.max(2000)`.

8. **`images.unoptimized: true`** causes the browser to fetch arbitrary external image URLs directly. Remove this and configure `images.remotePatterns` to allowlist Google Custom Search domains.

---

### 10.4 Rate Limiting

**Current state:** `lib/security/rate-limit.ts` uses an in-process `Map`. The code itself has a `TODO` acknowledging the problem.

**Gaps & actions:**
- **The rate limiter is non-functional in production.** Vercel serverless functions run in isolated execution contexts with no shared memory. Every request sees `count = 1` in a fresh `Map`. Replace with **Upstash Redis** (`@upstash/ratelimit` with `FixedWindow`) — it's a drop-in replacement for the existing `checkRateLimit` interface and has a Vercel integration.
- Add a `generate:papers` scope to `RateLimitScope`; the `papers` operation currently falls through to `generate:response` unintentionally.
- Add rate limiting to `POST /api/stella/chats` (e.g., 10 creations/min/user).

---

### 10.5 Performance

**Gaps & actions:**
- **Remove `images: { unoptimized: true }`** from `next.config.js`. Configure `images.remotePatterns` instead. This re-enables WebP conversion, responsive sizing, and lazy loading for the up-to-24 images rendered per chat.
- **Remove `--webpack`** from the `build` script in `package.json`. This forces the slower Webpack bundler; Turbopack is the default and significantly faster.
- **Change `tsconfig.json` `target` from `"es5"` to `"es2017"`**. ES5 output requires more polyfills and produces larger bundles for a stack running on Node 22 and modern browsers.
- **Move `chats.updated_at` maintenance** to a Postgres trigger (`BEFORE UPDATE ON messages`) to eliminate one sequential DB write from the hot path.
- **Add `@next/bundle-analyzer`** and audit which of the 23 Radix UI packages are actually imported.

---

### 10.6 CI/CD

**Current state:** `.github/workflows/ci.yml` runs lint → typecheck → build. No tests, no audit, no deployment config.

**Gaps & actions:**
- Add `npm audit --audit-level=high` as a CI step.
- Add a `test` step (even as a no-op placeholder until tests are written).
- **Standardize on one package manager.** Both `package-lock.json` and `pnpm-lock.yaml` are committed. CI uses `npm ci`. Choose one and delete the other lockfile.
- **Add `vercel.json`** with explicit `functions` config — especially `maxDuration` for the generate route (default 10s on Hobby, needs 60s on Pro). Without this, Vercel kills long-running generations with a 504, leaving placeholder messages permanently stuck in `status: "generating"`.
- **Move dev-only packages to `devDependencies`:** `eslint`, `typescript`, `@types/*`, `autoprefixer`, `postcss`, `tailwindcss`.
- Resolve the Next.js version mismatch: `package.json` lists `"next": "^16.1.1"` but `eslint-config-next` and `@next/swc-wasm-nodejs` are at `13.5.1`. Run `npm ls next` to confirm the installed version and align all three. Remove `@next/swc-wasm-nodejs` if on Next.js 14+.

---

### 10.7 Error Handling

**Gaps & actions:**
- **Placeholder not cleaned up on unhandled exceptions.** If the top-level `catch` fires (e.g., a network error not caught by `fetchWithRetry`), the placeholder message is left in the DB with `status: "generating"` indefinitely. Add a `finally` block or cleanup helper that sets the placeholder to `status: "error"`. The client polling loop must treat `"error"` as a terminal state.
- **Add `maxDuration` in `vercel.json`** and an application-level timeout slightly below the Vercel limit to allow graceful cleanup before the function is killed.
- **`apiRequest` in `chat-service.ts` swallows non-JSON responses.** If the server returns a Vercel 504 HTML error page, `payload` stays `null` and the error message is `'Request failed'` with no context. Log the response status and a truncated body when `response.json()` fails.
- **Papers operation missing error log.** The papers fetch failure path in `generate/route.ts` does not call `logger.error`, unlike the equivalent images path. Add it for consistency.

---

### 10.8 Accessibility

**Gaps & actions:**
- Add `eslint-plugin-jsx-a11y` to `.eslintrc.json` with the `recommended` ruleset.
- Add `@axe-core/playwright` to the E2E suite for automated WCAG 2.1 AA checks on the chat and auth pages.
- Audit image rendering components: ensure `alt` attributes are populated from the Google Custom Search `title` or `snippet` field.
- Add `aria-live="polite"` regions around thinking/generating status indicators so screen reader users receive feedback during generation.
- Document WCAG 2.1 AA as the target accessibility standard.

---

### 10.9 Data Integrity & Database Discipline

**Gaps & actions:**
- **No DB migration history.** There is no `supabase/migrations/` directory. The schema exists only in the Supabase dashboard and `lib/supabase/schema.md`. Initialize `supabase/migrations/` with the current schema as the baseline. Use `supabase db diff` for all future schema changes.
- **Chat + message creation is not transactional.** In `POST /api/stella/chats`, if the message insert fails and the cleanup delete also fails, an orphan chat row remains. Wrap creation in a Postgres transaction via a Supabase RPC function.
- **RLS is not tested.** Add integration tests that use two different user sessions to verify cross-user isolation (a user cannot read or write another user's chats/messages).
- **`messages.meta` has no DB-level constraint.** Add a Postgres check constraint enforcing it is a JSON object. Change `MessageMetaSchema` from `.passthrough()` to `.strict()` to reject unknown keys at the application layer.
- **Run `supabase gen types typescript`** to generate `lib/supabase/database.types.ts` from the live schema. Add this to the development workflow to prevent type drift.
- Consider adding `deleted_at TIMESTAMPTZ` to `chats` for soft delete and recovery.

---

### 10.10 Clinical Safety

**Gaps & actions:**
- **Add post-generation output validation** before writing to the DB: check for the expected markdown structure (presence of `## DIFFERENTIAL DIAGNOSIS:` header, at least one diagnosis entry).
- **Append a standardized disclaimer at the server level** (not just in the UI) to every generated response.
- **Add content moderation** using Gemini's built-in safety settings or a separate moderation API call before writing output to the DB.
- **Add an append-only `generation_audit` table** recording `user_id`, `message_id`, `prompt_hash`, `model`, `timestamp`, and `output_hash` for every generation event. The current `messages` table is mutable (placeholder update pattern overwrites the row), which is insufficient for a clinical audit trail.

---

### Priority Order (Highest Impact First)

| Priority | Action | Effort |
|---|---|---|
| 1 | ~~Create `middleware.ts`~~ — `proxy.ts` is correct for Next.js 16 ✅ | Done |
| 2 | Replace in-memory rate limiter with Upstash Redis | 2–4 hrs |
| 3 | Add `vercel.json` with `maxDuration` for generate route | 15 min |
| 4 | Add security headers to `next.config.js` | 30 min |
| 5 | Fix internal error message leak in `generate/route.ts` catch block | 15 min |
| 6 | Wire a log sink (Axiom/Logtail) | 1–2 hrs |
| 7 | Install test runner + write first unit tests | 4–8 hrs |
| 8 | Remove `images: { unoptimized: true }`, configure `remotePatterns` | 30 min |
| 9 | Remove `--webpack` build flag; fix Next.js version mismatch | 30 min |
| 10 | Initialize `supabase/migrations/` with baseline schema | 1 hr |
