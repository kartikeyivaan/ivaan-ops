"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Company = { id: string; name: string; code: string };

export function WarehouseForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, name, code, isActive: true }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to create warehouse.");
      return;
    }

    setMessage("Warehouse created.");
    setName("");
    setCode("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Warehouse</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="companyId">Company</Label>
            <select
              id="companyId"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouseName">Name</Label>
            <Input id="warehouseName" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="warehouseCode">Code</Label>
            <Input id="warehouseCode" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create warehouse"}
            </Button>
            {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
