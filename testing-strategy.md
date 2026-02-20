# Testing Strategy

This document explains how testing currently works, what each layer proves, and how to run production-grade verification.

## 1. Testing Goals

- Catch regressions before deploy.
- Verify critical user flows (auth, chat, generation, images).
- Detect production failures quickly (availability, latency, error spikes).
- Keep tests understandable and tied to system risks.

## 2. Current Automated Baseline

Current enforced checks (CI + local):

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`

What this proves:

- Lint: static code quality and obvious anti-patterns.
- Typecheck: type-level contract consistency.
- Build: route compilation, App Router correctness, production bundling.

What this does NOT prove:

- Auth flows actually roundtrip.
- Generate endpoint behavior under real requests.
- Realtime/polling update behavior in browser runtime.
- Production runtime health over time.

## 3. Critical Flows to Validate

These are the flows that matter most for this product:

1. Login/logout/session redirects.
2. Forgot-password -> update-password session recovery.
3. New chat creation + initial user message write.
4. `POST /stella/generate` response flow.
5. `POST /stella/generate` images flow.
6. Chat UI intermediate status updates (hybrid realtime + polling fallback).
7. Rate limit behavior (`429` + headers) under repeated generate requests.

## 4. Recommended Test Layers

## 4.1 Unit Tests

Scope:

- Pure logic only.
- No network, no DB.

Targets:

- schema parsing (`lib/schemas/chat.ts`)
- task mapping and route payload validation helpers
- rate-limit math helpers (`lib/security/rate-limit.ts`)
- generate-service retry/timeout decision helpers

Value:

- Fast feedback on deterministic logic.

## 4.2 Integration Tests (Server Routes)

Scope:

- Route handler behavior + request/response contracts.
- Mock provider calls where needed.

Targets:

- `/api/stella/chats` GET/POST
- `/api/stella/chats/[chatID]` GET/PATCH/DELETE
- `/api/stella/chats/[chatID]/messages` GET
- `/stella/generate` response + images
- error paths and `429` rate limit paths

Value:

- Confirms backend contracts the UI depends on.

## 4.3 E2E Tests (Browser)

Scope:

- Real browser + real app behavior.

Targets:

- Auth entry pages and redirects
- Chat creation and assistant response rendering
- Intermediate thinking/status transitions without manual refresh
- Image column updates

Value:

- Highest confidence for user-visible correctness.

## 5. Production Verification Model

## 5.1 Pre-deploy Gate

Required before release:

1. CI green (`lint`, `typecheck`, `build`).
2. Integration tests green.
3. E2E smoke flow green on preview env.

## 5.2 Post-deploy Smoke Checks

Run immediately after deploy:

1. Open login page and verify redirect logic.
2. Send one known generate request and confirm:
   - placeholder appears
   - intermediate statuses update
   - final response appears
3. Trigger enough requests to confirm rate limiting response and headers.

## 5.3 Ongoing Production Monitoring

Track continuously:

- request volume by endpoint
- error rate (`5xx`, provider errors)
- rate-limit hit rate (`429`)
- generation latency distributions
- image fetch latency distributions

Alert when:

- error rate breaches threshold
- p95 latency jumps significantly
- rate-limit hits spike abnormally

## 6. Practical Rollout Plan

Phase 1:

- Keep existing CI checks.
- Add route-level integration tests for `generate` and chats API.

Phase 2:

- Add browser E2E smoke flow for auth + chat + generation.

Phase 3:

- Add production synthetic checks and alert thresholds from observability metrics.

## 7. How This Works Operationally

- CI prevents obviously broken code from shipping.
- Integration tests prevent backend contract regressions.
- E2E tests prevent UX/runtime regressions.
- Production monitoring catches issues that only appear under real traffic.

This layered model is what turns "it builds" into "it is operationally reliable in production."
