export const NOTIFICATIONS_POLL_MS = 60_000;
export const NOTIFICATIONS_MIN_GAP_MS = 15_000;

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationsInboxState = {
  items: NotificationItem[];
  unreadCount: number;
  lastCountFetchedAt: number | null;
  lastListFetchedAt: number | null;
};

export function shouldFetchNotifications(input: {
  visible: boolean;
  inFlight: boolean;
  now: number;
  lastFetchedAt: number | null;
  minGapMs?: number;
  force?: boolean;
}) {
  if (input.inFlight) return false;
  if (input.force) return true;
  if (!input.visible) return false;
  if (input.lastFetchedAt == null) return true;
  return input.now - input.lastFetchedAt >= (input.minGapMs ?? NOTIFICATIONS_MIN_GAP_MS);
}

const emptyState: NotificationsInboxState = {
  items: [],
  unreadCount: 0,
  lastCountFetchedAt: null,
  lastListFetchedAt: null,
};

let state: NotificationsInboxState = emptyState;
let countInFlight: Promise<void> | null = null;
let listInFlight: Promise<void> | null = null;
let pollTimer: number | null = null;
let visibilityBound = false;
const listeners = new Set<() => void>();

function clearPollTimer() {
  if (pollTimer == null || typeof window === "undefined") return;
  window.clearInterval(pollTimer);
  pollTimer = null;
}

function ensurePollTimer() {
  if (typeof window === "undefined" || pollTimer != null) return;
  pollTimer = window.setInterval(() => {
    if (!isDocumentVisible()) {
      clearPollTimer();
      return;
    }
    void refreshNotificationsInbox();
  }, NOTIFICATIONS_POLL_MS);
}

function emit() {
  for (const listener of listeners) listener();
}

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

async function fetchCount() {
  if (countInFlight) return countInFlight;

  countInFlight = (async () => {
    try {
      const response = await fetch("/api/notifications?countOnly=true");
      const fetchedAt = Date.now();
      if (!response.ok) {
        state = { ...state, lastCountFetchedAt: fetchedAt };
        return;
      }
      const payload = (await response.json()) as { unreadCount?: number };
      state = {
        ...state,
        unreadCount: payload.unreadCount ?? 0,
        lastCountFetchedAt: fetchedAt,
      };
    } catch {
      state = { ...state, lastCountFetchedAt: Date.now() };
    } finally {
      emit();
    }
  })().finally(() => {
    countInFlight = null;
  });

  return countInFlight;
}

async function fetchList() {
  if (listInFlight) return listInFlight;

  listInFlight = (async () => {
    try {
      const response = await fetch("/api/notifications");
      const fetchedAt = Date.now();
      if (!response.ok) {
        state = { ...state, lastCountFetchedAt: fetchedAt, lastListFetchedAt: fetchedAt };
        return;
      }
      const payload = (await response.json()) as {
        items?: NotificationItem[];
        unreadCount?: number;
      };
      state = {
        items: payload.items ?? [],
        unreadCount: payload.unreadCount ?? 0,
        lastCountFetchedAt: fetchedAt,
        lastListFetchedAt: fetchedAt,
      };
    } catch {
      const fetchedAt = Date.now();
      state = { ...state, lastCountFetchedAt: fetchedAt, lastListFetchedAt: fetchedAt };
    } finally {
      emit();
    }
  })().finally(() => {
    listInFlight = null;
  });

  return listInFlight;
}

export async function refreshNotificationsInbox(options?: {
  list?: boolean;
  force?: boolean;
}) {
  const visible = isDocumentVisible();

  if (options?.list) {
    if (listInFlight) await listInFlight;
    if (
      !shouldFetchNotifications({
        visible,
        inFlight: listInFlight != null,
        now: Date.now(),
        lastFetchedAt: state.lastListFetchedAt,
        force: options.force,
      })
    ) {
      return;
    }
    await fetchList();
    return;
  }

  if (countInFlight) await countInFlight;
  if (
    !shouldFetchNotifications({
      visible,
      inFlight: countInFlight != null,
      now: Date.now(),
      lastFetchedAt: state.lastCountFetchedAt,
      force: options.force,
    })
  ) {
    return;
  }
  await fetchCount();
}

function onVisibilityChange() {
  if (!isDocumentVisible()) {
    clearPollTimer();
    return;
  }
  ensurePollTimer();
  void refreshNotificationsInbox();
}

function startPolling() {
  if (typeof window === "undefined") return;

  if (!visibilityBound) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = true;
  }

  if (!isDocumentVisible()) {
    clearPollTimer();
    return;
  }

  ensurePollTimer();
  void refreshNotificationsInbox();
}

function stopPolling() {
  clearPollTimer();
  if (visibilityBound && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visibilityBound = false;
  }
}

export function subscribeNotificationsInbox(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

export function getNotificationsInboxSnapshot() {
  return state;
}

export function getNotificationsInboxServerSnapshot() {
  return emptyState;
}

export async function markNotificationRead(id: string) {
  await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  await refreshNotificationsInbox({ list: true, force: true });
}
