# Changes Required to Reach Industry Standards

## 1. Dependency and Toolchain Alignment

### Immediate
- Align core framework versions to one compatible line.
  - `next`
  - `eslint-config-next`
  - `@next/swc-wasm-nodejs`
  - `eslint`
  - `react`
  - `react-dom`
- Remove deprecated Next.js config keys and ensure all scripts are Next 16 compatible.
- Keep linting strict and deterministic in CI.

### Recommended target actions
- Pin exact versions for framework-critical packages.
- Use one lockfile strategy (`package-lock.json` or `pnpm-lock.yaml`) and remove the other.
- Add engines in `package.json` (Node + npm/pnpm version policy).

## 2. Build and CI Pipeline Hardening

### Immediate
- Keep `lint`, `typecheck`, and `build` as separate required CI jobs.
- Enforce `--max-warnings=0` in lint.
- Build in a deterministic mode (current workaround: webpack build).

### Add CI checks
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Fail PRs on any check failure.

## 3. Auth and Route Correctness

### Fix broken route references
- Password reset redirect points to wrong path.
- Update-password completion redirects to a non-existent protected route.
- OTP confirm route redirects to `/error` while error page currently exists under `/stella/error`.
- Error page defines content helper but does not render it.

### Standardize auth flow
- Single source of truth for auth paths/constants.
- Ensure login/signup/forgot/reset/confirm all roundtrip correctly in E2E tests.

## 4. Centralized Session Enforcement

### Current issue
- Session guard logic exists (`lib/supabase/proxy.ts`) but is not wired as global middleware.

### Required changes
- Add `middleware.ts` that calls session update/protection helper.
- Define explicit allowlist/denylist for public routes.
- Eliminate route protection drift between client-only guards and server checks.

## 5. Data Access Architecture

### Current issue
- Mixed client-direct Supabase writes and server writes increase complexity and policy drift risk.

### Required changes
- Move chat/message mutations to server-side route handlers or server actions.
- Keep Supabase RLS as defense in depth, not as sole control plane.
- Add request validation (Zod) for every API boundary.

## 6. Type Safety and Domain Modeling

### Current issue
- Heavy `any` usage in core message metadata path.

### Required changes
- Define strict `MessageMeta` schema with Zod + TypeScript types.
- Replace all `any` in chat/generation flow with typed interfaces.
- Add exhaustive status/task enums and runtime schema validation at read/write points.

## 7. Reliability and Async Processing

### Current issue
- Polling-only UI sync and placeholder mutation patterns are fragile at scale.

### Required changes
- Add idempotency keys for generation requests.
- Add retry policy with bounded backoff for provider calls.
- Add timeout/circuit-breaker handling for Gemini/Search APIs.
- Migrate from pure polling to push or hybrid updates (Supabase realtime/SSE).

## 8. Observability and Operations

### Required changes
- Replace ad-hoc `console.log` with structured logging.
- Add correlation/request IDs from frontend -> API -> provider calls.
- Capture metrics:
  - latency by phase (task select, generation, image search)
  - error rates by endpoint/provider
  - token usage/cost tracking
- Integrate error monitoring (e.g., Sentry).

## 9. Security and Abuse Controls

### Required changes
- Add route-level rate limiting for generation endpoints.
- Add abuse throttling per user/IP and anomaly detection.
- Add prompt/content moderation guardrails before and after generation.
- Sanitize/normalize all externally sourced content before rendering/storage.

## 10. Medical/Clinical Safety Controls

### Required changes
- Keep and strengthen non-clinical-use disclaimer across all generation surfaces.
- Add explicit confidence/uncertainty and escalation guidance conventions.
- Add policy checks for prohibited clinical directives.
- Add human-review gates for any workflow that could be interpreted as decision support.

## 11. Testing Strategy (Minimum Production Baseline)

### Unit tests
- Task mapping and task-selection parsing.
- Metadata schema encode/decode.
- Prompt builder invariants.

### Integration tests
- `/stella/generate` response flow.
- `/stella/generate` image flow.
- Auth callback and password reset flows.

### E2E tests
- Login -> new chat -> generation -> image hydration.
- Signup disabled/enabled flows.
- Broken-route regression tests for auth pages.

## 12. Frontend Quality and UX Consistency

### Required changes
- Consolidate loading/error states across chat pages and forms.
- Ensure every caught error has user-visible feedback.
- Remove debug logs from user-facing flows.
- Add accessibility audits (keyboard nav, landmarks, labels, contrast).

## 13. Config and Secrets Hygiene

### Required changes
- Validate required env vars at startup.
- Fail fast with actionable errors if keys are missing.
- Document env var contract in a tracked `.env.example`.
- Enforce separation between public and server-only secrets.

## 14. Database and Migration Discipline

### Required changes
- Replace schema-only markdown docs with tracked SQL migrations.
- Add index and constraint verification in migration scripts.
- Add tests/checks for RLS policy behavior.

## 15. Repository Hygiene

### Required changes
- Add root `README.md` with architecture, runbook, and deployment instructions.
- Add `CONTRIBUTING.md` with coding/testing standards.
- Add ownership and review boundaries for critical areas (auth, generation, data).

## 16. Prioritized Execution Plan

### Phase 0 (1-3 days): Stability
- Fix route mismatches in auth/reset/error flows.
- Finalize dependency matrix alignment.
- Ensure lint/typecheck/build are green in CI.

### Phase 1 (3-7 days): Safety + Correctness
- Introduce typed `MessageMeta` + Zod validation.
- Remove `any` in core flows.
- Add structured logging + request IDs.
- Add generation endpoint rate limiting.

### Phase 2 (1-2 weeks): Reliability
- Add integration and E2E tests for auth + generation.
- Add idempotency and retry/backoff semantics.
- Add provider timeout and fallback handling.

### Phase 3 (2-4 weeks): Production Maturity
- Move remaining client-side DB mutations to server-side boundaries.
- Add middleware-based centralized session policy.
- Add observability dashboards and alerting thresholds.
- Add migration-based DB lifecycle and RLS verification checks.

## 17. Definition of “Industry Standard” for This Repo

The project is at industry-standard readiness when:
- Dependency matrix is coherent and reproducible.
- CI enforces lint/typecheck/build/tests on every PR.
- Auth routes are correct and centrally protected.
- Generation APIs are typed, validated, rate-limited, and observable.
- Core flows are covered by automated integration/E2E tests.
- Security/compliance controls are explicit, tested, and documented.
