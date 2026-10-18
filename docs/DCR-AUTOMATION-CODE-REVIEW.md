# DCR automation — code review / simplify findings

Notes from a **read-only review** of the DCR automation engine (cloud services, APIs, UI, `packages/automation-agent`). For system design in plain English, see [DCR-AUTOMATION-ARCHITECTURE.md](./DCR-AUTOMATION-ARCHITECTURE.md).

---

## Scope

- `src/lib/automation-service.ts`, `automation-api.ts`, `automation-device-auth.ts`
- `src/app/api/automation/**`
- `src/components/automation/**`
- `packages/automation-agent/**`
- Related eligibility: `src/lib/dcr-documentation-eligibility.ts`

---

## Fixed (already applied)

| Topic | What changed |
|-------|----------------|
| Queue sync | Removed unused fields from DB lookup when checking existing rows |
| Starting a run | Batch writes (`updateMany` / `createMany`) instead of per-line updates |
| Cancelling a run | Single `updateMany` for queue items in `PROCESSING` |
| Runnable statuses | Removed `REQUIRES_ATTENTION` from start-run list until that status is used in code |
| Types | `PiCreditStatus` on queue eligibility helpers |
| Company access (POST) | `assertAutomationCompanyIds()`; explicit `FORBIDDEN_COMPANY` handling |
| Agent auth helper | `tryAuthenticateAutomationDevice` only swallows `DEVICE_UNAUTHORIZED` |
| Execution polling | `GET .../executions/:id?omitScreenshots=1`; UI merges poll without dropping screenshots |
| Agent heartbeat | Cloud client checks `response.ok` |
| API consistency | Execution routes use shared `automationJsonError` |

---

## Recommended later (not implemented)

| Topic | Why deferred |
|-------|----------------|
| Single portal-order definition | Duplicated across eligibility, Prisma, agent `PORTAL_ORDER` — needs shared module or codegen |
| One DB read for execution page | GET API + SSR both load execution; could share one helper |
| Summary-only poll endpoint | Poll still returns full attempts (minus screenshots) |
| Async bcrypt / session token | Sync bcrypt on every agent request adds latency |
| Optional skip sync on start | Sync on every start is safe but redundant if user just synced |
| Eligibility in SQL | Queue list filters in memory after heavy join |
| Queue pagination / slimmer list | Serials and full rows on every list load |
| Agent idle backoff | Fixed 5s claim loop; could backoff when idle |
| Slim claim response | Empty `attempts: []`; agent uses `pending-attempts` |
| Real Playwright workflow | Needs post-login portal UX spec |
| Screenshot upload pipeline | URLs vs full storage upload |

---

## Schema scaffolding (not bugs)

Enums such as `AWAITING_LOGIN`, `REQUIRES_ATTENTION`, `SKIPPED`, `ALREADY_ISSUED` exist in Prisma for future flows; not all are wired in services yet.

---

## Verification at time of review

- `npm run lint` — clean
- Vitest: `dcr-documentation-eligibility`, `automation-device-auth`
- `npm run automation-agent:build` — OK

---

*Review pass: DCR automation MVP (cloud + agent stub).*
