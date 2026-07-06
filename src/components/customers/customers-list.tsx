"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleFilterCard } from "@/components/ui/collapsible-filter-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CUSTOMER_TYPES, formatCustomerType } from "@/lib/customers";
import { CustomerImportWizard } from "@/components/customers/customer-import-wizard";
import { BulkReassignDialog } from "@/components/customers/bulk-reassign-dialog";
import type { CustomerListItem } from "@/lib/customer-service";

type SalesExecutive = { id: string; name: string; email: string };

export function CustomersList({
  initialCustomers,
  salesExecutives,
  canEdit,
  canReassign,
}: {
  initialCustomers: CustomerListItem[];
  salesExecutives: SalesExecutive[];
  canEdit: boolean;
  canReassign: boolean;
}) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [loading, setLoading] = useState(false);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (customerType) params.set("customerType", customerType);
    if (assignedSalesUserId) params.set("assignedSalesUserId", assignedSalesUserId);

    const response = await fetch(`/api/customers?${params.toString()}`);
    const data = await response.json();
    setLoading(false);
    if (response.ok) {
      setCustomers(data);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Company-owned customers with assigned sales executives.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <Button variant="outline" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" />
                Import Excel
              </Button>
              <Button asChild>
                <Link href="/sales/customers/new">
                  <Plus className="h-4 w-4" />
                  New Customer
                </Link>
              </Button>
            </>
          ) : null}
          {canReassign ? (
            <Button
              variant="secondary"
              disabled={selectedIds.length === 0}
              onClick={() => setShowReassign(true)}
            >
              <Users className="h-4 w-4" />
              Reassign ({selectedIds.length})
            </Button>
          ) : null}
        </div>
      </div>

      <CollapsibleFilterCard title="Search & Filter" contentClassName="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, GST, code" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerType">Type</Label>
            <select
              id="customerType"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              <option value="">All</option>
              {CUSTOMER_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="executive">Sales Executive</Label>
            <select
              id="executive"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={assignedSalesUserId}
              onChange={(e) => setAssignedSalesUserId(e.target.value)}
            >
              <option value="">All</option>
              {salesExecutives.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <Button onClick={applyFilters} disabled={loading}>
              {loading ? "Searching..." : "Apply filters"}
            </Button>
          </div>
      </CollapsibleFilterCard>

      <Card>
        <CardContent className="pt-6">
          <Table responsive>
            <TableHeader>
              <TableRow>
                {canReassign ? <TableHead className="w-10" /> : null}
                <TableHead>Customer</TableHead>
                <TableHead>City</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  {canReassign ? (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(customer.id)}
                        onChange={() => toggleSelection(customer.id)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell data-label="Customer">
                    <Link
                      href={`/sales/customers/${customer.id}`}
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      {customer.customerName}
                    </Link>
                    <p className="text-xs text-slate-500">{customer.customerCode}</p>
                  </TableCell>
                  <TableCell data-label="City">{customer.city ?? "—"}</TableCell>
                  <TableCell data-label="GST">{customer.gstNumber}</TableCell>
                  <TableCell data-label="Type">{formatCustomerType(customer.customerType)}</TableCell>
                  <TableCell data-label="Executive">{customer.assignedSalesUser.name}</TableCell>
                  <TableCell data-label="Outstanding">
                    ₹{customer.metrics.outstandingValue.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell data-label="Status">
                    <Badge variant={customer.status === "ACTIVE" ? "success" : "danger"}>
                      {customer.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canReassign ? 8 : 7} className="text-center text-slate-500">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showImport ? (
        <CustomerImportWizard
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            router.refresh();
            applyFilters();
          }}
        />
      ) : null}

      {showReassign ? (
        <BulkReassignDialog
          customerIds={selectedIds}
          salesExecutives={salesExecutives}
          onClose={() => setShowReassign(false)}
          onReassigned={() => {
            setShowReassign(false);
            setSelectedIds([]);
            router.refresh();
            applyFilters();
          }}
        />
      ) : null}
    </div>
  );
}
