"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Attention = {
  total: number;
  overdue: number;
  dueToday: number;
  awaitingAcknowledgement: number;
};

export function YourAttentionCard() {
  const [data, setData] = useState<Attention | null>(null);

  useEffect(() => {
    fetch("/api/tasks/attention")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setData(payload))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Your Attention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-3xl font-semibold text-slate-900">{data.total} Tasks</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-slate-500">Overdue</p>
            <p className="font-semibold text-red-700">{data.overdue}</p>
          </div>
          <div>
            <p className="text-slate-500">Due today</p>
            <p className="font-semibold text-amber-700">{data.dueToday}</p>
          </div>
          <div>
            <p className="text-slate-500">Awaiting ack.</p>
            <p className="font-semibold text-slate-800">{data.awaitingAcknowledgement}</p>
          </div>
        </div>
        <Link href="/tasks" className="inline-block text-sm font-medium text-emerald-700 hover:underline">
          View Tasks →
        </Link>
      </CardContent>
    </Card>
  );
}
