"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CUSTOMER_TYPES } from "@/lib/customers";

type SalesExecutive = { id: string; name: string; email: string };

type ContactInput = {
  name: string;
  designation: string;
  mobile: string;
  email: string;
};

type CustomerFormProps = {
  mode: "create" | "edit";
  customerId?: string;
  salesExecutives: SalesExecutive[];
  initialValues?: {
    customerName: string;
    contactPersonName: string;
    customerType: "DEALER" | "PROJECT";
    gstNumber: string;
    address: string;
    city: string;
    state: string;
    pinCode: string;
    mobile: string;
    email: string;
    assignedSalesUserId: string;
    status: "ACTIVE" | "INACTIVE";
    contacts: ContactInput[];
  };
};

const emptyContact = (): ContactInput => ({
  name: "",
  designation: "",
  mobile: "",
  email: "",
});

export function CustomerForm({
  mode,
  customerId,
  salesExecutives,
  initialValues,
}: CustomerFormProps) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? "");
  const [contactPersonName, setContactPersonName] = useState(
    initialValues?.contactPersonName ?? "",
  );
  const [customerType, setCustomerType] = useState<"DEALER" | "PROJECT">(
    initialValues?.customerType ?? "DEALER",
  );
  const [gstNumber, setGstNumber] = useState(initialValues?.gstNumber ?? "");
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [state, setState] = useState(initialValues?.state ?? "");
  const [pinCode, setPinCode] = useState(initialValues?.pinCode ?? "");
  const [mobile, setMobile] = useState(initialValues?.mobile ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [assignedSalesUserId, setAssignedSalesUserId] = useState(
    initialValues?.assignedSalesUserId ?? salesExecutives[0]?.id ?? "",
  );
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(
    initialValues?.status ?? "ACTIVE",
  );
  const [contacts, setContacts] = useState<ContactInput[]>(
    initialValues?.contacts?.length ? initialValues.contacts : [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateContact(index: number, field: keyof ContactInput, value: string) {
    setContacts((current) =>
      current.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact,
      ),
    );
  }

  function removeContact(index: number) {
    setContacts((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const payload = {
      customerName,
      contactPersonName: contactPersonName || undefined,
      customerType,
      gstNumber,
      address,
      city,
      state,
      pinCode: pinCode || undefined,
      mobile,
      email,
      assignedSalesUserId,
      status,
      contacts: contacts
        .filter((contact) => contact.name.trim())
        .map((contact) => ({
          name: contact.name,
          designation: contact.designation || undefined,
          mobile: contact.mobile || undefined,
          email: contact.email || undefined,
        })),
    };

    const response = await fetch(
      mode === "create" ? "/api/customers" : `/api/customers/${customerId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(data.message ?? "Failed to save customer.");
      return;
    }

    router.push(`/sales/customers/${data.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Create Customer" : "Edit Customer"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customerName">Firm Name</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="contactPersonName">Contact Person Name</Label>
            <Input
              id="contactPersonName"
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              placeholder="Primary contact at the firm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerType">Customer Type</Label>
            <select
              id="customerType"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as "DEALER" | "PROJECT")}
            >
              {CUSTOMER_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstNumber">GST Number</Label>
            <Input
              id="gstNumber"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pinCode">PIN Code</Label>
            <Input
              id="pinCode"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit PIN"
              maxLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignedSalesUserId">Assigned Sales Executive</Label>
            <select
              id="assignedSalesUserId"
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={assignedSalesUserId}
              onChange={(e) => setAssignedSalesUserId(e.target.value)}
              required
            >
              {salesExecutives.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          {mode === "edit" ? (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          ) : null}

          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Optional Contacts</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setContacts([...contacts, emptyContact()])}
              >
                Add contact
              </Button>
            </div>
            {contacts.map((contact, index) => (
              <div key={index} className="rounded-md border p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">Contact {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                    aria-label={`Remove contact ${index + 1}`}
                    onClick={() => removeContact(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Contact name"
                    value={contact.name}
                    onChange={(e) => updateContact(index, "name", e.target.value)}
                  />
                  <Input
                    placeholder="Designation"
                    value={contact.designation}
                    onChange={(e) => updateContact(index, "designation", e.target.value)}
                  />
                  <Input
                    placeholder="Mobile"
                    value={contact.mobile}
                    onChange={(e) => updateContact(index, "mobile", e.target.value)}
                  />
                  <Input
                    placeholder="Email"
                    value={contact.email}
                    onChange={(e) => updateContact(index, "email", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : mode === "create" ? "Create customer" : "Save changes"}
            </Button>
            {message ? <p className="w-full text-sm text-red-600">{message}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
