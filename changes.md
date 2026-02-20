# Changes Required to Reach Industry Standards

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
- Replace ad-hoc `console.log` with structured logging.
- Add correlation/request IDs from frontend -> API -> provider calls.
- Capture metrics:
  - latency by phase (task select, generation, image search)
  - error rates by endpoint/provider
  - token usage/cost tracking
- Integrate error monitoring (e.g., Sentry).

## 4. Security and Abuse Controls

### Required changes
- Add route-level rate limiting for generation endpoints.
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
- Add generation endpoint rate limiting.

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
