"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalForm, ModalHeader } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeMobileNumber } from "@/lib/phone";

type Role = { id: string; name: string };
type Company = { id: string; name: string; code: string };

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  officialContactNumber: string | null;
  personalContactNumber: string | null;
  digitalVisitingCardUrl: string | null;
  status: "ACTIVE" | "INACTIVE" | "LOCKED";
  roles: Array<{ role: Role }>;
  companies: Array<{ company: Company }>;
};

export function UserEditDialog({
  user,
  roles,
  companies,
  onClose,
}: {
  user: EditableUser;
  roles: Role[];
  companies: Company[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [officialContactNumber, setOfficialContactNumber] = useState(
    user.officialContactNumber ?? "",
  );
  const [personalContactNumber, setPersonalContactNumber] = useState(
    user.personalContactNumber ?? "",
  );
  const [digitalVisitingCardUrl, setDigitalVisitingCardUrl] = useState(
    user.digitalVisitingCardUrl ?? "",
  );
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "LOCKED">(user.status);
  const [roleIds, setRoleIds] = useState<string[]>(user.roles.map((r) => r.role.id));
  const [companyIds, setCompanyIds] = useState<string[]>(
    user.companies.map((c) => c.company.id),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(user.name);
    setEmail(user.email);
    setOfficialContactNumber(user.officialContactNumber ?? "");
    setPersonalContactNumber(user.personalContactNumber ?? "");
    setDigitalVisitingCardUrl(user.digitalVisitingCardUrl ?? "");
    setStatus(user.status);
    setRoleIds(user.roles.map((r) => r.role.id));
    setCompanyIds(user.companies.map((c) => c.company.id));
    setMessage(null);
  }, [user]);

  function toggleValue(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        officialContactNumber: officialContactNumber || undefined,
        personalContactNumber: personalContactNumber || undefined,
        digitalVisitingCardUrl: digitalVisitingCardUrl || undefined,
        status,
        roleIds,
        companyIds,
      }),
    });

    const rawBody = await response.text();
    let data: { message?: string } = {};
    try {
      data = rawBody ? (JSON.parse(rawBody) as { message?: string }) : {};
    } catch {
      data = {};
    }
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to update user.");
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title="Edit User" onClose={onClose} />
      <ModalForm onSubmit={handleSubmit}>
        <ModalBody className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-officialContactNumber">Official Contact Number</Label>
              <Input
                id="edit-officialContactNumber"
                value={officialContactNumber}
                onChange={(e) => setOfficialContactNumber(normalizeMobileNumber(e.target.value))}
                inputMode="numeric"
                placeholder="10-digit mobile"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-personalContactNumber">Personal Contact Number</Label>
              <Input
                id="edit-personalContactNumber"
                value={personalContactNumber}
                onChange={(e) => setPersonalContactNumber(normalizeMobileNumber(e.target.value))}
                inputMode="numeric"
                placeholder="10-digit mobile"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-digitalVisitingCardUrl">Link of Digital Visiting Card</Label>
              <Input
                id="edit-digitalVisitingCardUrl"
                type="url"
                value={digitalVisitingCardUrl}
                onChange={(e) => setDigitalVisitingCardUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              {user.status === "LOCKED" ? (
                <div className="space-y-2">
                  <Input id="edit-status" value="LOCKED" disabled />
                  <p className="text-sm text-amber-700">
                    This account is locked. Use Change Password to unlock and set a new
                    temporary password.
                  </p>
                </div>
              ) : (
                <select
                  id="edit-status"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={roleIds.includes(role.id)}
                      onChange={() => setRoleIds(toggleValue(roleIds, role.id))}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Companies</Label>
              <div className="flex flex-wrap gap-2">
                {companies.map((company) => (
                  <label
                    key={company.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={companyIds.includes(company.id)}
                      onChange={() => setCompanyIds(toggleValue(companyIds, company.id))}
                    />
                    {company.name}
                  </label>
                ))}
              </div>
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
