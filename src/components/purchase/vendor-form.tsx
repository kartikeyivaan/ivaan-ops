"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VendorForm() {
  const router = useRouter();
  const [vendorName, setVendorName] = useState("");
  const [gst, setGst] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const response = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorName,
        gst: gst || undefined,
        address: address || undefined,
        contactPerson: contactPerson || undefined,
        mobile: mobile || undefined,
        email: email || undefined,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to create vendor.");
      return;
    }

    setMessage("Vendor created successfully.");
    setVendorName("");
    setGst("");
    setAddress("");
    setContactPerson("");
    setMobile("");
    setEmail("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Vendor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="vendorName">Vendor Name</Label>
            <Input
              id="vendorName"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst">GST Number</Label>
            <Input id="gst" value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact Person</Label>
            <Input
              id="contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create vendor"}
            </Button>
            {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
