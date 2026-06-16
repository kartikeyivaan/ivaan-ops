import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listVendors } from "@/lib/inventory-service";
import { prisma } from "@/lib/prisma";
import { canManageVendors, canViewVendors } from "@/lib/vendor-permissions";
import { VendorForm } from "@/components/purchase/vendor-form";
import { VendorsList } from "@/components/purchase/vendors-list";

export default async function PurchaseVendorsPage() {
  const session = await auth();
  if (!session?.user || !canViewVendors(session.user.roles)) {
    redirect("/dashboard");
  }

  const canManage = canManageVendors(session.user.roles);
  const vendors = await listVendors(prisma, { includeInactive: true });

  const serializedVendors = vendors.map((vendor) => ({
    id: vendor.id,
    vendorName: vendor.vendorName,
    gst: vendor.gst,
    address: vendor.address,
    contactPerson: vendor.contactPerson,
    mobile: vendor.mobile,
    email: vendor.email,
    isActive: vendor.isActive,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vendor Management</h1>
        <p className="text-sm text-slate-500">
          Maintain supplier master data used when creating incoming purchase lots.
        </p>
      </div>

      {canManage ? <VendorForm /> : null}

      <VendorsList vendors={serializedVendors} canManage={canManage} />
    </div>
  );
}
