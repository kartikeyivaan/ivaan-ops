"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeMobileNumber } from "@/lib/phone";

type ExecutiveOption = { id: string; name: string };

export function ProjectEnquiryForm({ showExecutiveField }: { showExecutiveField: boolean }) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [nextFollowupAt, setNextFollowupAt] = useState("");
  const [salesUserId, setSalesUserId] = useState("");
  const [executives, setExecutives] = useState<ExecutiveOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showExecutiveField) return;
    void fetch("/api/project-enquiries/sales-executives").then(async (response) => {
      if (!response.ok) return;
      setExecutives(await response.json());
    });
  }, [showExecutiveField]);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/project-enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        customerMobile,
        nextFollowupAt,
        salesUserId: salesUserId || undefined,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to create enquiry.");
      return;
    }
    router.replace(`/projects/enquiries/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">New Project Enquiry</h1>
        <p className="text-sm text-slate-500">Capture minimum details and schedule next follow-up.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enquiry Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input id="customerName" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerMobile">Mobile Number *</Label>
            <Input id="customerMobile" value={customerMobile} onChange={(event) => setCustomerMobile(normalizeMobileNumber(event.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nextFollowupAt">Next Follow-up *</Label>
            <Input id="nextFollowupAt" type="date" value={nextFollowupAt} onChange={(event) => setNextFollowupAt(event.target.value)} />
          </div>
          {showExecutiveField ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="salesUserId">Sales Executive</Label>
              <select id="salesUserId" value={salesUserId} onChange={(event) => setSalesUserId(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value="">Auto-assign to me</option>
                {executives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button onClick={() => void handleSubmit()} disabled={saving || !customerName.trim() || !customerMobile.trim() || !nextFollowupAt}>
              {saving ? "Creating..." : "Create Enquiry"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
