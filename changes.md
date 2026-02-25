# Changes Required to Reach Industry Standards

## Recent Changes (2026-02-25): Streaming Differential Diagnosis

### Problem
The differential diagnosis generation showed only a skeleton during the entire generation phase, with all text appearing at once at the end. No incremental streaming was visible to the user.

### Root Causes (in order of discovery)

1. **`gemini-2.5-pro` thinking phase** — The model runs an internal reasoning phase (20–60s) before emitting any output tokens. During this phase the SSE stream sends zero text chunks, so the client sees nothing until generation completes. Fixed by switching the streaming call to `gemini-2.5-flash` with `thinkingConfig: { thinkingBudget: 0 }`, which disables thinking and streams tokens immediately.

2. **`callGemini` (task selection, image keywords, paper extraction) also on `gemini-2.5-pro`** — The "Analyzing description..." phase was hanging for the same reason. Fixed by switching `callGemini` to `gemini-2.5-flash` (no thinking config needed for non-streaming calls).

3. **Next.js Node.js runtime buffers `TransformStream`** — `pipeToNodeResponse` uses `pipeTo()` which processes the readable stream's internal queue. `TransformStream` allows the producer to push chunks faster than the consumer drains them, filling the internal buffer. All chunks accumulated before any were flushed to the socket. Fixed by replacing `TransformStream` with a pull-based `ReadableStream` using a manual queue and a `notifier` promise — the `pull` method only runs when the consumer is ready, yielding exactly one chunk at a time with true backpressure.

4. **Component remounting destroyed hook state** — `ChatPageContent` remounted 3 times before the stream started (due to `loading` state transitions in `useMessages` returning `<ChatLoadingSkeleton />`). Each remount created a fresh hook instance with `streamingContent = ''`. The stream ran in the first instance's closure, calling `setStreamingContent` on a dead component. The final mounted instance never received any updates. Fixed by moving the stream entirely out of React's lifecycle into a **module-level store** (`streamingStore` Map + `streamingListeners` Map) that survives all remounts. The stream starts immediately on module load via `startStreamIfPending()`, and each hook instance subscribes to updates on mount.

5. **`flushSync` inside `useEffect` is a no-op** — `flushSync` cannot be called inside React lifecycle methods or effects; React silently ignores it. Removed `flushSync` entirely — chunks arrive 200–300ms apart naturally, which is sufficient for React's normal scheduler to render each one incrementally.

### Files Changed
- `lib/services/generate-service.ts` — Switch streaming to `gemini-2.5-flash` + `thinkingBudget: 0`; switch `callGemini` to `gemini-2.5-flash`; replace `TransformStream` approach with pull-based `ReadableStream`; increase Gemini timeout to 90s; fix paper search (staggered requests, radiology-specific queries, parallel → sequential with 1100ms gap to respect Semantic Scholar 1 req/sec limit)
- `app/stella/generate/route.ts` — Replace `TransformStream` + `writer` with pull-based `ReadableStream` using `notifier` pattern; remove all `await writer.close()` / `await writer.abort()` in favour of `closeStream()`
- `hooks/use-chat-orchestration.ts` — Move stream lifecycle to module-level `streamingStore` + `streamingListeners`; remove `flushSync`; remove `streamStartedRef`; subscribe hook instances to module-level updates on mount
- `app/stella/[chatID]/page.tsx` — Change `if (loading)` early return to `if (loading && messages.length === 0)` to prevent unnecessary remounts; remove "Generating differential diagnosis..." label (replaced by live streaming text); add `streamingContent` guard to `thinkingPhase` effect
- `next.config.js` — Removed `compress: false` (not the root cause; reverted)



## 0. Explainability Standard (Persistent Project Rule)

- Every new design choice must have a clear rationale that can be explained in plain language.
- Every non-trivial function should have a single, explicit purpose and understandable control flow.
- Remove dead code quickly; do not keep unused helpers/constants/routes around \"just in case\".
- Prefer explicit naming and typed data models over clever/implicit logic.
- If a line cannot be justified, refactor or delete it.

## 1. Dependency and Toolchain Alignment

### Immediate
- Align core framework versions to one compatible line.
  - `next`
  - `eslint-config-next`
  - `@next/swc-wasm-nodejs`
  - `eslint`
  - `react`
  - `react-dom`

### Recommended target actions
- Pin exact versions for framework-critical packages.
- Use one lockfile strategy (`package-lock.json` or `pnpm-lock.yaml`) and remove the other.
- Add engines in `package.json` (Node + npm/pnpm version policy).

## 2. Type Safety and Domain Modeling

### Remaining work
- Remove residual `any` usages outside core chat/generation path (e.g., auth/profile/UI utility areas).
- Continue converting ambiguous payloads to schema-validated types.

## 3. Observability and Operations

### Required changes
- Capture metrics:
  - latency by phase (task select, generation, image search)
  - error rates by endpoint/provider
  - token usage/cost tracking
- Integrate error monitoring (e.g., Sentry).

## 4. Security and Abuse Controls

### Required changes
- Add abuse throttling per user/IP and anomaly detection.
- Add prompt/content moderation guardrails before and after generation.
- Sanitize/normalize all externally sourced content before rendering/storage.

## 5. Medical/Clinical Safety Controls

### Required changes
- Keep and strengthen non-clinical-use disclaimer across all generation surfaces.
- Add explicit confidence/uncertainty and escalation guidance conventions.
- Add policy checks for prohibited clinical directives.
- Add human-review gates for any workflow that could be interpreted as decision support.

## 6. Testing Strategy (Minimum Production Baseline)

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

## 7. Frontend Quality and UX Consistency

### Required changes
- Consolidate loading/error states across chat pages and forms.
- Ensure every caught error has user-visible feedback.
- Remove debug logs from user-facing flows.
- Add accessibility audits (keyboard nav, landmarks, labels, contrast).

## 8. Config and Secrets Hygiene

### Required changes
- Validate required env vars at startup.
- Fail fast with actionable errors if keys are missing.
- Document env var contract in a tracked `.env.example`.
- Enforce separation between public and server-only secrets.

## 9. Database and Migration Discipline

### Required changes
- Replace schema-only markdown docs with tracked SQL migrations.
- Add index and constraint verification in migration scripts.
- Add tests/checks for RLS policy behavior.

## 10. Repository Hygiene

### Required changes
- Add root `README.md` with architecture, runbook, and deployment instructions.
- Add `CONTRIBUTING.md` with coding/testing standards.
- Add ownership and review boundaries for critical areas (auth, generation, data).

## 11. Prioritized Execution Plan

### Phase 0 (1-3 days): Stability
- Finalize dependency matrix alignment.

### Phase 1 (3-7 days): Safety + Correctness
- Introduce typed `MessageMeta` + Zod validation.
- Remove `any` in core flows.
- Add structured logging + request IDs.

### Phase 2 (1-2 weeks): Reliability
- Add integration and E2E tests for auth + generation.

### Phase 3 (2-4 weeks): Production Maturity
- Add observability dashboards and alerting thresholds.
- Add migration-based DB lifecycle and RLS verification checks.

## 12. Definition of “Industry Standard” for This Repo

The project is at industry-standard readiness when:
- Dependency matrix is coherent and reproducible.
- CI enforces lint/typecheck/build/tests on every PR.
- Auth routes are correct and centrally protected.
- Generation APIs are typed, validated, rate-limited, and observable.
- Core flows are covered by automated integration/E2E tests.
- Security/compliance controls are explicit, tested, and documented.
