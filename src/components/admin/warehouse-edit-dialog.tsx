"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Company = { id: string; name: string; code: string };

export type EditableWarehouse = {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  company: Company;
};

export function WarehouseEditDialog({
  warehouse,
  companies,
  onClose,
}: {
  warehouse: EditableWarehouse;
  companies: Company[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(warehouse.companyId);
  const [name, setName] = useState(warehouse.name);
  const [code, setCode] = useState(warehouse.code ?? "");
  const [isActive, setIsActive] = useState(warehouse.isActive);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCompanyId(warehouse.companyId);
    setName(warehouse.name);
    setCode(warehouse.code ?? "");
    setIsActive(warehouse.isActive);
    setMessage(null);
  }, [warehouse]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch(`/api/warehouses/${warehouse.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, name, code: code || undefined, isActive }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to update warehouse.");
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="Edit Warehouse" onClose={onClose} />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-company">Company</Label>
            <select
              id="edit-company"
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
            <Label htmlFor="edit-warehouse-name">Name</Label>
            <Input
              id="edit-warehouse-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-warehouse-code">Code</Label>
            <Input
              id="edit-warehouse-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-warehouse-status">Status</Label>
            <select
              id="edit-warehouse-status"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </ModalFooter>
      </ModalForm>
    </Modal>
  );
}
