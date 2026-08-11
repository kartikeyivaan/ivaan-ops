"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeMobileNumber } from "@/lib/phone";

type Role = { id: string; name: string };
type Company = { id: string; name: string; code: string };

export function UserForm({
  roles,
  companies,
}: {
  roles: Role[];
  companies: Company[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [officialContactNumber, setOfficialContactNumber] = useState("");
  const [personalContactNumber, setPersonalContactNumber] = useState("");
  const [digitalVisitingCardUrl, setDigitalVisitingCardUrl] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleValue(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        officialContactNumber: officialContactNumber || undefined,
        personalContactNumber: personalContactNumber || undefined,
        digitalVisitingCardUrl: digitalVisitingCardUrl || undefined,
        status: "ACTIVE",
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
      setMessage(data.message ?? "Failed to create user.");
      return;
    }

    setMessage("User created successfully.");
    setName("");
    setEmail("");
    setPassword("");
    setOfficialContactNumber("");
    setPersonalContactNumber("");
    setDigitalVisitingCardUrl("");
    setRoleIds([]);
    setCompanyIds([]);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create User</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-slate-600">
          New users must set their own strong password on first sign-in.
        </p>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="officialContactNumber">Official Contact Number</Label>
            <Input
              id="officialContactNumber"
              value={officialContactNumber}
              onChange={(e) => setOfficialContactNumber(normalizeMobileNumber(e.target.value))}
              inputMode="numeric"
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personalContactNumber">Personal Contact Number</Label>
            <Input
              id="personalContactNumber"
              value={personalContactNumber}
              onChange={(e) => setPersonalContactNumber(normalizeMobileNumber(e.target.value))}
              inputMode="numeric"
              placeholder="10-digit mobile"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="digitalVisitingCardUrl">Link of Digital Visiting Card</Label>
            <Input
              id="digitalVisitingCardUrl"
              type="url"
              value={digitalVisitingCardUrl}
              onChange={(e) => setDigitalVisitingCardUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
                <label key={company.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create user"}
            </Button>
            {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
