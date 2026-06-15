import {
  CustomerStatus,
  CustomerType,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  calculateCustomerOutstanding,
  generateCustomerCode,
  isValidGstFormat,
  normalizeGstNumber,
  type CustomerImportPreviewRow,
  type CustomerImportRow,
} from "@/lib/customers";

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: {
    assignedSalesUser: { select: { id: true; name: true; email: true } };
    createdBy: { select: { id: true; name: true } };
    contacts: true;
    company: { select: { id: true; code: true; name: true } };
  };
}>;

export type CustomerListItem = CustomerWithRelations & {
  metrics: ReturnType<typeof calculateCustomerOutstanding>;
};

export function serializeCustomer(customer: CustomerWithRelations): CustomerListItem {
  return {
    ...customer,
    metrics: calculateCustomerOutstanding(),
  };
}

export async function listCustomers(
  prisma: PrismaClient,
  companyId: string,
  filters: {
    q?: string;
    city?: string;
    customerType?: CustomerType;
    assignedSalesUserId?: string;
    status?: CustomerStatus;
  },
) {
  const where: Prisma.CustomerWhereInput = {
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerType ? { customerType: filters.customerType } : {}),
    ...(filters.assignedSalesUserId
      ? { assignedSalesUserId: filters.assignedSalesUserId }
      : {}),
    ...(filters.city
      ? { city: { contains: filters.city, mode: "insensitive" } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { customerName: { contains: filters.q, mode: "insensitive" } },
            { gstNumber: { contains: normalizeGstNumber(filters.q), mode: "insensitive" } },
            { city: { contains: filters.q, mode: "insensitive" } },
            { customerCode: { contains: filters.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const customers = await prisma.customer.findMany({
    where,
    include: {
      assignedSalesUser: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      contacts: true,
      company: { select: { id: true, code: true, name: true } },
    },
    orderBy: { customerName: "asc" },
  });

  return customers.map(serializeCustomer);
}

export async function getCustomerById(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    include: {
      assignedSalesUser: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      contacts: true,
      company: { select: { id: true, code: true, name: true } },
    },
  });

  return customer ? serializeCustomer(customer) : null;
}

async function assertUniqueGst(
  prisma: PrismaClient,
  companyId: string,
  gstNumber: string,
  excludeCustomerId?: string,
) {
  const existing = await prisma.customer.findFirst({
    where: {
      companyId,
      gstNumber,
      ...(excludeCustomerId ? { NOT: { id: excludeCustomerId } } : {}),
    },
  });
  return existing;
}

export async function createCustomer(
  prisma: PrismaClient,
  input: {
    companyId: string;
    companyCode: string;
    createdById: string;
    customerName: string;
    customerType: CustomerType;
    gstNumber: string;
    address?: string;
    city?: string;
    state?: string;
    mobile?: string;
    email?: string;
    assignedSalesUserId: string;
    status?: CustomerStatus;
    contacts?: Array<{
      name: string;
      designation?: string;
      mobile?: string;
      email?: string;
    }>;
  },
) {
  const gstNumber = normalizeGstNumber(input.gstNumber);
  if (!isValidGstFormat(gstNumber)) {
    throw new Error("INVALID_GST");
  }

  const duplicate = await assertUniqueGst(prisma, input.companyId, gstNumber);
  if (duplicate) {
    throw new Error("DUPLICATE_GST");
  }

  const customerCode = await generateCustomerCode(
    prisma,
    input.companyId,
    input.companyCode,
  );

  return prisma.customer.create({
    data: {
      companyId: input.companyId,
      customerCode,
      customerName: input.customerName,
      customerType: input.customerType,
      gstNumber,
      address: input.address,
      city: input.city,
      state: input.state,
      mobile: input.mobile,
      email: input.email || null,
      assignedSalesUserId: input.assignedSalesUserId,
      createdById: input.createdById,
      status: input.status ?? CustomerStatus.ACTIVE,
      contacts: input.contacts?.length
        ? {
            create: input.contacts.map((contact) => ({
              name: contact.name,
              designation: contact.designation,
              mobile: contact.mobile,
              email: contact.email || null,
            })),
          }
        : undefined,
    },
    include: {
      assignedSalesUser: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      contacts: true,
      company: { select: { id: true, code: true, name: true } },
    },
  });
}

export async function updateCustomer(
  prisma: PrismaClient,
  customerId: string,
  companyId: string,
  input: {
    customerName?: string;
    customerType?: CustomerType;
    gstNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    mobile?: string;
    email?: string;
    assignedSalesUserId?: string;
    status?: CustomerStatus;
    contacts?: Array<{
      id?: string;
      name: string;
      designation?: string;
      mobile?: string;
      email?: string;
    }>;
  },
) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    include: { contacts: true },
  });
  if (!existing) {
    throw new Error("NOT_FOUND");
  }

  let gstNumber = existing.gstNumber;
  if (input.gstNumber) {
    gstNumber = normalizeGstNumber(input.gstNumber);
    if (!isValidGstFormat(gstNumber)) {
      throw new Error("INVALID_GST");
    }
    const duplicate = await assertUniqueGst(prisma, companyId, gstNumber, customerId);
    if (duplicate) {
      throw new Error("DUPLICATE_GST");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (input.contacts) {
      await tx.customerContact.deleteMany({ where: { customerId } });
      if (input.contacts.length > 0) {
        await tx.customerContact.createMany({
          data: input.contacts.map((contact) => ({
            customerId,
            name: contact.name,
            designation: contact.designation,
            mobile: contact.mobile,
            email: contact.email || null,
          })),
        });
      }
    }

    return tx.customer.update({
      where: { id: customerId },
      data: {
        customerName: input.customerName,
        customerType: input.customerType,
        gstNumber,
        address: input.address,
        city: input.city,
        state: input.state,
        mobile: input.mobile,
        email: input.email === "" ? null : input.email,
        assignedSalesUserId: input.assignedSalesUserId,
        status: input.status,
      },
      include: {
        assignedSalesUser: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true } },
        contacts: true,
        company: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

export async function reassignCustomers(
  prisma: PrismaClient,
  companyId: string,
  customerIds: string[],
  assignedSalesUserId: string,
) {
  const result = await prisma.customer.updateMany({
    where: {
      companyId,
      id: { in: customerIds },
    },
    data: { assignedSalesUserId },
  });

  return result.count;
}

export async function previewCustomerImport(
  prisma: PrismaClient,
  companyId: string,
  rows: CustomerImportRow[],
): Promise<CustomerImportPreviewRow[]> {
  const salesUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: { in: ["Sales Executive", "Sales Manager", "Super Admin"] },
          },
        },
      },
    },
    select: { id: true, email: true },
  });
  const salesByEmail = new Map(
    salesUsers.map((user) => [user.email.toLowerCase(), user.id]),
  );

  const existingGst = await prisma.customer.findMany({
    where: { companyId },
    select: { gstNumber: true },
  });
  const gstSet = new Set(existingGst.map((c) => c.gstNumber));
  const importGstSet = new Set<string>();

  return rows.map((row) => {
    const errors: string[] = [];
    const gstNumber = normalizeGstNumber(row.gstNumber);

    if (!row.customerName?.trim()) errors.push("Customer name is required.");
    if (!isValidGstFormat(gstNumber)) errors.push("Invalid GST format.");
    if (gstSet.has(gstNumber)) errors.push("GST already exists in company.");
    if (importGstSet.has(gstNumber)) errors.push("Duplicate GST in import file.");
    importGstSet.add(gstNumber);

    const salesUserId = salesByEmail.get(row.assignedSalesEmail.toLowerCase());
    if (!salesUserId) errors.push("Assigned sales email not found for this company.");

    return {
      ...row,
      gstNumber,
      errors,
      isValid: errors.length === 0,
    };
  });
}

export async function importCustomers(
  prisma: PrismaClient,
  companyId: string,
  companyCode: string,
  createdById: string,
  rows: CustomerImportRow[],
) {
  const preview = await previewCustomerImport(prisma, companyId, rows);
  const validRows = preview.filter((row) => row.isValid);
  if (validRows.length === 0) {
    throw new Error("NO_VALID_ROWS");
  }

  const salesUsers = await prisma.user.findMany({
    where: {
      companies: { some: { companyId } },
      roles: {
        some: {
          role: {
            name: { in: ["Sales Executive", "Sales Manager", "Super Admin"] },
          },
        },
      },
    },
    select: { id: true, email: true },
  });
  const salesByEmail = new Map(
    salesUsers.map((user) => [user.email.toLowerCase(), user.id]),
  );

  const created = [];
  for (const row of validRows) {
    const assignedSalesUserId = salesByEmail.get(row.assignedSalesEmail.toLowerCase())!;
    const customer = await createCustomer(prisma, {
      companyId,
      companyCode,
      createdById,
      customerName: row.customerName,
      customerType: row.customerType,
      gstNumber: row.gstNumber,
      address: row.address,
      city: row.city,
      state: row.state,
      mobile: row.mobile,
      email: row.email,
      assignedSalesUserId,
      contacts: row.contactName
        ? [
            {
              name: row.contactName,
              designation: row.contactDesignation,
              mobile: row.contactMobile,
              email: row.contactEmail,
            },
          ]
        : undefined,
    });
    created.push(customer);
  }

  return {
    importedCount: created.length,
    skippedCount: preview.length - validRows.length,
    customers: created,
  };
}
