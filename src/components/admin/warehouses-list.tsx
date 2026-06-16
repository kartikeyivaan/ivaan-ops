"use client";

import { useState } from "react";
import { parseApiJson } from "@/lib/api-response";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import {
  WarehouseEditDialog,
  type EditableWarehouse,
} from "@/components/admin/warehouse-edit-dialog";
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

type Company = { id: string; name: string; code: string };

export function WarehousesList({
  warehouses,
  companies,
  canManage,
}: {
  warehouses: EditableWarehouse[];
  companies: Company[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingWarehouse, setEditingWarehouse] = useState<EditableWarehouse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(warehouse: EditableWarehouse) {
    const confirmed = window.confirm(
      `Delete ${warehouse.name}? Warehouses with inventory history will be deactivated instead.`,
    );
    if (!confirmed) return;

    setDeletingId(warehouse.id);
    setMessage(null);

    const response = await fetch(`/api/warehouses/${warehouse.id}`, { method: "DELETE" });
    const data = await parseApiJson<{
      message?: string;
      deactivated?: boolean;
    }>(response);
    setDeletingId(null);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to delete warehouse.");
      return;
    }

    if (data.deactivated) {
      setMessage(
        data.message ??
          "Warehouse has existing inventory or dispatch records and was deactivated instead of permanently deleted.",
      );
    } else {
      setMessage(`${warehouse.name} was permanently deleted.`);
    }

    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Warehouse List</CardTitle>
        </CardHeader>
        <CardContent>
          {message ? <p className="mb-4 text-sm text-slate-600">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell>{warehouse.company.code}</TableCell>
                  <TableCell className="font-medium">{warehouse.name}</TableCell>
                  <TableCell>{warehouse.code ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={warehouse.isActive ? "success" : "danger"}>
                      {warehouse.isActive ? "Active" : "Inactive"}
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
                            aria-label={`More options for ${warehouse.name}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingWarehouse(warehouse)}>
                            Edit Warehouse
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:bg-red-50 focus:text-red-700"
                            disabled={deletingId === warehouse.id}
                            onClick={() => handleDelete(warehouse)}
                          >
                            {deletingId === warehouse.id ? "Deleting..." : "Delete Warehouse"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editingWarehouse ? (
        <WarehouseEditDialog
          warehouse={editingWarehouse}
          companies={companies}
          onClose={() => setEditingWarehouse(null)}
        />
      ) : null}
    </>
  );
}
