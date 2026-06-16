"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { parseApiJson } from "@/lib/api-response";
import {
  VendorEditDialog,
  type EditableVendor,
} from "@/components/purchase/vendor-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function VendorsList({
  vendors,
  canManage,
}: {
  vendors: EditableVendor[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingVendor, setEditingVendor] = useState<EditableVendor | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);

  async function handleDelete(vendor: EditableVendor) {
    const confirmed = window.confirm(
      `Delete ${vendor.vendorName}? Vendors with purchase history will be marked inactive instead.`,
    );
    if (!confirmed) return;

    setDeletingId(vendor.id);
    setMessage(null);

    const response = await fetch(`/api/vendors/${vendor.id}`, { method: "DELETE" });
    const data = await parseApiJson<{ message?: string; deactivated?: boolean }>(response);
    setDeletingId(null);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to delete vendor.");
      return;
    }

    if (data.deactivated) {
      setMessage(data.message ?? `${vendor.vendorName} was marked inactive.`);
    } else {
      setMessage(`${vendor.vendorName} was permanently deleted.`);
    }

    router.refresh();
  }

  async function handleMarkInactive(vendor: EditableVendor) {
    if (!vendor.isActive) return;

    const confirmed = window.confirm(`Mark ${vendor.vendorName} as inactive?`);
    if (!confirmed) return;

    setInactivatingId(vendor.id);
    setMessage(null);

    const response = await fetch(`/api/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName: vendor.vendorName,
        gst: vendor.gst ?? undefined,
        address: vendor.address ?? undefined,
        contactPerson: vendor.contactPerson ?? undefined,
        mobile: vendor.mobile ?? undefined,
        email: vendor.email ?? undefined,
        isActive: false,
      }),
    });

    const data = await parseApiJson<{ message?: string }>(response);
    setInactivatingId(null);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to mark vendor inactive.");
      return;
    }

    setMessage(`${vendor.vendorName} was marked inactive.`);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vendor List</CardTitle>
        </CardHeader>
        <CardContent>
          {message ? <p className="mb-4 text-sm text-slate-600">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-slate-500">
                    No vendors found.
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.vendorName}</TableCell>
                    <TableCell>{vendor.gst ?? "—"}</TableCell>
                    <TableCell>{vendor.contactPerson ?? "—"}</TableCell>
                    <TableCell>{vendor.mobile ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={vendor.isActive ? "success" : "danger"}>
                        {vendor.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`More options for ${vendor.vendorName}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingVendor(vendor)}>
                              Edit Vendor
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!vendor.isActive || inactivatingId === vendor.id}
                              onClick={() => handleMarkInactive(vendor)}
                            >
                              {inactivatingId === vendor.id ? "Updating..." : "Mark Inactive"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:bg-red-50 focus:text-red-700"
                              disabled={deletingId === vendor.id}
                              onClick={() => handleDelete(vendor)}
                            >
                              {deletingId === vendor.id ? "Deleting..." : "Delete Vendor"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingVendor ? (
        <VendorEditDialog vendor={editingVendor} onClose={() => setEditingVendor(null)} />
      ) : null}
    </>
  );
}
