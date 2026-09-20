# Prompt 15A — Dashboard cache + Refresh button

You are implementing **only this prompt**. Do not change notification polling, PDF generation, Excel exports, or `next.config.ts` tracing.

## Goal

Stop recalculating the sales dashboard on every visit. Serve the last computed dashboard until the user clicks **Refresh**.

This is the highest-ROI Fluid Active CPU cut. Dashboard work is CPU-heavy (many Prisma queries plus JS aggregation plus RSC render). There is **no** dashboard timer today; cost comes from opening `/dashboard`, changing company, or changing period.

## Out of scope

- Auto-refresh, `setInterval`, or background polling on the dashboard
- Caching other list pages (inward lots, PIs, inventory)
- Notification bell
- PDF / xlsx / `outputFileTracingIncludes`
- Redis, KV, or a new database table (use Next.js `unstable_cache` + `revalidateTag`)
- Changing KPI math, widgets, or permissions

## Current behaviour

- `src/app/(app)/dashboard/page.tsx` calls `getManagerDashboard` or `getExecutiveDashboard` on every request (`src/lib/sales-dashboard/dashboard-service.ts`).
- Those functions fan out: KPI strip, dispatch today, work queue, aging, stock watch, trend, module targets, module mastery (executive); approvals, team scoreboard, pipeline risks, stock conflicts (manager).
- Fallback: `src/components/dashboard/legacy-role-dashboard.tsx` runs its own count queries (warehouse / accounts / sales widgets).
- Period chips in `src/components/dashboard/dashboard-period-selector.tsx` navigate with `?period=`.
- Company switch already `router.refresh()`s the app.

There is **no** `unstable_cache` / `revalidateTag` anywhere in the repo yet.

## Required behaviour

1. Cache the **computed dashboard DTO** (not the HTML) across requests.
2. Cache key **must** include all of:
   - dashboard kind: `manager` | `executive` | `legacy`
   - sorted `companyIds` (all-companies scope is a different key)
   - `restrictToUserId` / executive user id when the view is personal
   - `period`, `fromDate`, `toDate`, `trendMetric`
3. Serve cache until **Refresh**. Do not use a short TTL as the main bust (no “recalculate every 30s in the background”).
4. **Refresh** button on executive, manager, **and** legacy dashboards:
   - busts that user’s/company’s dashboard cache
   - reloads the page so numbers recompute once
   - sits next to the period selector on sales dashboards; on legacy, near the heading
5. Show **Updated {time}** (business-local if the app already has a helper; otherwise a clear local timestamp). Hide or show “just now” after a successful Refresh.
6. Changing **period** is a different cache key → compute if missing (correct).
7. Changing **company** is a different cache key → compute if missing (correct).
8. Refresh must not change period, company, or query string except what is needed to reload.

Optional (only if it is a small extra, not a new subsystem): call the same `revalidateTag` from existing mutations that already `router.refresh()` after PI book / dispatch confirm. Skip this if it spreads across many files.

## Implementation notes

Preferred pattern:

```ts
import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";

// Inside the cached function: call getExecutiveDashboard(prisma, scope, query).
// Do NOT read cookies()/headers()/auth() inside unstable_cache.
// Resolve session + scope in the page, pass serializable args into the cached function.

unstable_cache(
  async () => { /* compute */ },
  ["sales-dashboard", kind, companyKey, userKey, period, fromDate, toDate, trendMetric],
  { tags: [tag], revalidate: false },
);
```

- `revalidate: false` means persist until `revalidateTag(tag)`.
- Tag should be specific enough that one executive Refresh does not wipe every manager in every company. Suggested: `dashboard:${kind}:${companyKey}:${userKey}`.
- `prisma` is not a cache key; close over the existing `prisma` singleton inside the cached callback, or call `getExecutiveDashboard` from a module-level cached wrapper that uses `prisma` internally.
- Add `generatedAt: string` (ISO) on the payload or a thin wrapper `{ generatedAt, data }` so the UI can show Updated time. Prefer extending the existing DTOs in `src/lib/sales-dashboard/dashboard-types.ts` rather than a parallel type.
- Refresh: a server action in something like `src/app/(app)/dashboard/actions.ts` that verifies `auth()`, recomputes the same tag the page uses, calls `revalidateTag`, then the client `router.refresh()`.
- Disable the button while refresh is in flight; restore on completion; on failure keep stale data and show a simple error (toast or inline text). Do not invent a new toast library.
- Legacy dashboard: cache the widget counts the same way, same Refresh + Updated line.
- `YourAttentionCard` / tasks are separate. Do not fold them into this cache unless they are already part of the dashboard DTO (they are not — leave them).
- Module mastery celebration should still run off the cached DTO; Refresh is how a new celebration appears.

## Files you will likely touch

| File | Why |
|------|-----|
| `src/app/(app)/dashboard/page.tsx` | Call cached loaders instead of services directly |
| `src/lib/sales-dashboard/dashboard-service.ts` | Keep compute functions; add cached wrappers nearby or in `dashboard-cache.ts` |
| `src/lib/sales-dashboard/dashboard-types.ts` | `generatedAt` |
| `src/components/dashboard/executive-dashboard-view.tsx` | Refresh + Updated |
| `src/components/dashboard/manager-dashboard-view.tsx` | Refresh + Updated |
| `src/components/dashboard/legacy-role-dashboard.tsx` | Same |
| `src/app/(app)/dashboard/actions.ts` | New server action |
| New `src/lib/sales-dashboard/dashboard-cache.ts` | Tag + key helpers so page and action cannot drift |
| Tests next to the cache helpers | Key/tag stability, Refresh bust |

Do not restyle the whole dashboard. Reuse existing button classes (emerald / outline) from nearby components.

## Tests

Add unit tests for cache **key and tag** builders (deterministic, company order independent, period included).

If you can test the server action without a full Next runtime, do so. Do not mock the entire dashboard fan-out.

Existing: `src/lib/sales-dashboard/dashboard-permissions.test.ts` — do not break permissions.

## QA checklist (browser)

Use a sales manager and a sales executive seed user.

- [ ] First visit to `/dashboard` still shows correct widgets (not empty).
- [ ] Second visit (navigate away to a PI, then Dashboard) is fast and shows the **same** numbers plus an Updated time — it must not look like a blank loading dashboard for long.
- [ ] **Refresh** recomputes; Updated time changes; a known data change (or period switch + switch back after Refresh) is visible.
- [ ] Period chips still work (Today / Week / Month / Quarter); each period has its own numbers.
- [ ] Company switcher still shows that company’s dashboard.
- [ ] Executive-only user still sees own dashboard, not the team board.
- [ ] Manager still sees team scoreboard / approvals.
- [ ] Legacy roles (warehouse / accounts) still see their cards; Refresh works there too.
- [ ] Failed Refresh does not wipe the page.
- [ ] No new network polling while sitting on the dashboard (`/dashboard` should not refetch on a timer).

## Done when

- Cache + Refresh + Updated time work for manager, executive, and legacy.
- Tests added; `npm run test` and `npm run build` pass.
- You did not modify notifications, PDF, xlsx, or `next.config.ts`.
