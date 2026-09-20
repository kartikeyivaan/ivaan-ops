# Prompt 15B — Slow notification bell polling

You are implementing **only this prompt**. Do not change the dashboard, PDF generation, Excel exports, or `next.config.ts`.

## Goal

Cut background Fluid CPU from the notification bell. Today every visible logged-in tab calls `/api/notifications?countOnly=true` every **60 seconds**. Change the idle poll to **5 minutes**. Opening the bell must stay immediate and fresh.

This is a small, localized change. Do not invent websockets, SSE, or a Refresh button on the bell.

## Out of scope

- Dashboard cache / Refresh
- PDF, xlsx, `next.config.ts`
- Changing notification create/read APIs or Prisma queries
- Push, websocket, or “mark all read” UX changes
- Polling while the tab is hidden (already paused — keep that)

## Current behaviour

`src/lib/notifications-inbox.ts`:

- `NOTIFICATIONS_POLL_MS = 60_000` — `setInterval` while the document is visible.
- `NOTIFICATIONS_MIN_GAP_MS = 15_000` — extra throttle for overlapping fetches.
- Hidden tab: timer cleared; on visible again: fetch + restart timer.
- `src/components/layout/notification-bell.tsx`: opening the dropdown calls `refreshNotificationsInbox({ list: true, force: true })`.
- Count endpoint: `GET /api/notifications?countOnly=true` in `src/app/api/notifications/route.ts`.
- Tests: `src/lib/notifications-inbox.test.ts` cover `shouldFetchNotifications` (visibility, in-flight, 15s gap, `force`). They do **not** yet assert `NOTIFICATIONS_POLL_MS`.

`SessionProvider` in `src/components/providers.tsx` already uses `refetchInterval={20 * 60}` and `refetchOnWindowFocus={false}`. Leave it alone.

## Required behaviour

1. Set idle poll interval to **5 minutes** (`300_000` ms). Export remains `NOTIFICATIONS_POLL_MS` so tests can lock the value.
2. Keep `NOTIFICATIONS_MIN_GAP_MS` at 15 seconds (bell open / visibility return should not be delayed to 5 minutes).
3. Keep: first fetch when a subscriber mounts and the tab is visible.
4. Keep: no polling when `document.visibilityState !== "visible"`.
5. Keep: opening the bell force-fetches the **list** immediately.
6. Keep: `markNotificationRead` still force-refreshes the list.
7. Do not add a Refresh control on the bell unless the existing UI already has one (it does not).

## Implementation notes

- This should be a constant change plus tests. If you touch timer setup, do not regress the “only poll when someone is subscribed” behaviour (`subscribeNotificationsInbox` starts/stops with listener count).
- Do not change the API response shape.
- Do not prefetch the full list on the interval; the interval should still use count-only (`refreshNotificationsInbox()` without `list: true`), same as today.

## Files you will likely touch

| File | Why |
|------|-----|
| `src/lib/notifications-inbox.ts` | `NOTIFICATIONS_POLL_MS` |
| `src/lib/notifications-inbox.test.ts` | Assert 5 minutes; keep existing gap tests |

## Tests

- Assert `NOTIFICATIONS_POLL_MS === 300_000`.
- Existing `shouldFetchNotifications` cases must still pass (hidden tab, in-flight, 15s gap, `force` bypasses gap but not in-flight).
- Do not write a flaky fake-timer integration unless you already use that style.

## QA checklist (browser)

Log in, leave the app shell open with the bell visible.

- [ ] Badge still appears after a real unread notification (create a task assigned to yourself, or use an existing unread).
- [ ] Opening the bell still lists items immediately (do not wait 5 minutes).
- [ ] Clicking an item still marks it read.
- [ ] Switching to another tab then back still resumes (one fetch, then slow poll).
- [ ] In DevTools Network, `/api/notifications?countOnly=true` should fire about every 5 minutes while idle, not every 60 seconds.
- [ ] Closing the dropdown does not start a fast poll.

## Done when

- Poll is 5 minutes; bell open is still fresh; tests pass; `npm run test` and `npm run build` pass.
- You did not modify dashboard, PDF, xlsx, or `next.config.ts`.
