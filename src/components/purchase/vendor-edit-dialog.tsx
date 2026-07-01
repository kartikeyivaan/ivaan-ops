"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EditableVendor = {
  id: string;
  vendorName: string;
  gst: string | null;
  address: string | null;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
};

export function VendorEditDialog({
  vendor,
  onClose,
}: {
  vendor: EditableVendor;
  onClose: () => void;
}) {
  const router = useRouter();
  const [vendorName, setVendorName] = useState(vendor.vendorName);
  const [gst, setGst] = useState(vendor.gst ?? "");
  const [address, setAddress] = useState(vendor.address ?? "");
  const [contactPerson, setContactPerson] = useState(vendor.contactPerson ?? "");
  const [mobile, setMobile] = useState(vendor.mobile ?? "");
  const [email, setEmail] = useState(vendor.email ?? "");
  const [isActive, setIsActive] = useState(vendor.isActive);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setVendorName(vendor.vendorName);
    setGst(vendor.gst ?? "");
    setAddress(vendor.address ?? "");
    setContactPerson(vendor.contactPerson ?? "");
    setMobile(vendor.mobile ?? "");
    setEmail(vendor.email ?? "");
    setIsActive(vendor.isActive);
    setMessage(null);
  }, [vendor]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch(`/api/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName,
        gst: gst || undefined,
        address: address || undefined,
        contactPerson: contactPerson || undefined,
        mobile: mobile || undefined,
        email: email || undefined,
        isActive,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to update vendor.");
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title="Edit Vendor" onClose={onClose} />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="edit-vendorName">Vendor Name</Label>
            <Input
              id="edit-vendorName"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-gst">GST Number</Label>
            <Input id="edit-gst" value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-contactPerson">Contact Person</Label>
            <Input
              id="edit-contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-mobile">Mobile</Label>
            <Input id="edit-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {message ? <p className="text-sm text-red-600 md:col-span-2">{message}</p> : null}
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
