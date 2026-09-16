"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const payload = await response.json();
    setItems(payload.items ?? []);
    setUnreadCount(payload.unreadCount ?? 0);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function markRead(id: string, href?: string | null) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    await load();
    return href;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          Notifications
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-slate-500">No notifications yet.</p>
          ) : (
            items.map((item) => (
              <DropdownMenuItem key={item.id} className="items-start p-0">
                <Link
                  href={item.href || "/tasks"}
                  onClick={() => void markRead(item.id, item.href)}
                  className={`block w-full px-3 py-2 ${item.isRead ? "bg-white" : "bg-emerald-50"}`}
                >
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-600">{item.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDate(item.createdAt)}</p>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
