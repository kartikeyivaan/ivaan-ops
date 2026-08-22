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
import { decimalToNumber } from "@/lib/inventory";
import {
  resolveListPagination,
  toPaginatedList,
  type ListPaginationInput,
  type PaginatedList,
} from "@/lib/list-pagination";

const customerInclude = {
  assignedSalesUser: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  contacts: true,
} satisfies Prisma.CustomerInclude;

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: typeof customerInclude;
}>;

export type CustomerListItem = Omit<CustomerWithRelations, "incentiveCreditPercent"> & {
  incentiveCreditPercent: number;
  metrics: ReturnType<typeof calculateCustomerOutstanding>;
};

function mapCustomerDecimals(customer: CustomerWithRelations) {
  return {
    ...customer,
    incentiveCreditPercent: decimalToNumber(customer.incentiveCreditPercent),
  };
}

// Customers are a global master shared by every company. Metrics (outstanding,
// open PIs/quotations, dispatch value) are still scoped to the active company so
// each company sees its own dealings with the shared customer.
export async function serializeCustomer(
  prisma: PrismaClient,
  customer: CustomerWithRelations,
  companyId: string,
): Promise<CustomerListItem> {
  const { getCustomerQuotationMetrics } = await import("@/lib/quotation-service");
  const { getCustomerPiMetrics } = await import("@/lib/pi-service");
  const { getCustomerDispatchMetrics } = await import("@/lib/dispatch-service");
  const [quotationMetrics, piMetrics, dispatchMetrics] = await Promise.all([
    getCustomerQuotationMetrics(prisma, companyId, customer.id),
    getCustomerPiMetrics(prisma, companyId, customer.id),
    getCustomerDispatchMetrics(prisma, companyId, customer.id),
  ]);

  return {
    ...mapCustomerDecimals(customer),
    metrics: {
      outstandingValue: piMetrics.outstandingValue,
      openPiCount: piMetrics.openPiCount,
      openQuotationCount: quotationMetrics.openQuotationCount,
      totalDispatchValueThisYear: dispatchMetrics.totalDispatchValueThisYear,
    },
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
  } & ListPaginationInput,
): Promise<PaginatedList<CustomerListItem>> {
  const where: Prisma.CustomerWhereInput = {
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

  const { page, pageSize, skip, take, unpaged } = resolveListPagination(filters);

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: customerInclude,
      orderBy: { customerName: "asc" },
      ...(unpaged ? {} : { skip, take }),
    }),
  ]);

  const items = await Promise.all(
    customers.map((customer) => serializeCustomer(prisma, customer, companyId)),
  );
  return toPaginatedList(items, total, page, unpaged ? total : pageSize);
}

export async function getCustomerById(
  prisma: PrismaClient,
  companyId: string,
  customerId: string,
) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: customerInclude,
  });

  return customer ? serializeCustomer(prisma, customer, companyId) : null;
}

async function assertUniqueGst(
  prisma: PrismaClient,
  gstNumber: string,
  excludeCustomerId?: string,
) {
  const existing = await prisma.customer.findFirst({
    where: {
      gstNumber,
      ...(excludeCustomerId ? { NOT: { id: excludeCustomerId } } : {}),
    },
  });
  return existing;
}

export async function createCustomer(
  prisma: PrismaClient,
  input: {
    createdById: string;
    customerName: string;
    contactPersonName?: string;
    customerType: CustomerType;
    gstNumber: string;
    address?: string;
    city?: string;
    state?: string;
    pinCode?: string;
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

  const duplicate = await assertUniqueGst(prisma, gstNumber);
  if (duplicate) {
    throw new Error("DUPLICATE_GST");
  }

  const customerCode = await generateCustomerCode(prisma);

  return prisma.customer.create({
    data: {
      customerCode,
      customerName: input.customerName.trim().toUpperCase(),
      contactPersonName: input.contactPersonName || null,
      customerType: input.customerType,
      gstNumber,
      address: input.address,
      city: input.city,
      state: input.state,
      pinCode: input.pinCode || null,
      mobile: input.mobile,
      email: input.email || null,
      assignedSalesUserId: input.assignedSalesUserId,
      createdById: input.createdById,
      updatedById: input.createdById,
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
    include: customerInclude,
  });
}

export async function updateCustomer(
  prisma: PrismaClient,
  customerId: string,
  input: {
    updatedById: string;
    customerName?: string;
    contactPersonName?: string;
    customerType?: CustomerType;
    gstNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    pinCode?: string;
    mobile?: string;
    email?: string;
    assignedSalesUserId?: string;
    status?: CustomerStatus;
    incentiveCreditPercent?: number;
    contacts?: Array<{
      id?: string;
      name: string;
      designation?: string;
      mobile?: string;
      email?: string;
    }>;
  },
) {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
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
    const duplicate = await assertUniqueGst(prisma, gstNumber, customerId);
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
        customerName:
          input.customerName === undefined
            ? undefined
            : input.customerName.trim().toUpperCase(),
        contactPersonName: input.contactPersonName === "" ? null : input.contactPersonName,
        customerType: input.customerType,
        gstNumber,
        address: input.address,
        city: input.city,
        state: input.state,
        pinCode: input.pinCode === "" ? null : input.pinCode,
        mobile: input.mobile,
        email: input.email === "" ? null : input.email,
        assignedSalesUserId: input.assignedSalesUserId,
        status: input.status,
        incentiveCreditPercent:
          input.incentiveCreditPercent === undefined
            ? undefined
            : input.incentiveCreditPercent,
        updatedById: input.updatedById,
      },
      include: customerInclude,
    });
  });
}

export async function reassignCustomers(
  prisma: PrismaClient,
  customerIds: string[],
  assignedSalesUserId: string,
) {
  const result = await prisma.customer.updateMany({
    where: {
      id: { in: customerIds },
    },
    data: { assignedSalesUserId },
  });

  return result.count;
}

export async function previewCustomerImport(
  prisma: PrismaClient,
  rows: CustomerImportRow[],
): Promise<CustomerImportPreviewRow[]> {
  const salesUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
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
    select: { gstNumber: true },
  });
  const gstSet = new Set(existingGst.map((c) => c.gstNumber));
  const importGstSet = new Set<string>();

  return rows.map((row) => {
    const errors: string[] = [];
    const gstNumber = normalizeGstNumber(row.gstNumber);

    if (!row.customerName?.trim()) errors.push("Customer name is required.");
    if (!isValidGstFormat(gstNumber)) errors.push("Invalid GST format.");
    if (gstSet.has(gstNumber)) errors.push("GST already exists.");
    if (importGstSet.has(gstNumber)) errors.push("Duplicate GST in import file.");
    importGstSet.add(gstNumber);

    const salesUserId = salesByEmail.get(row.assignedSalesEmail.toLowerCase());
    if (!salesUserId) errors.push("Assigned sales email not found.");

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
  createdById: string,
  rows: CustomerImportRow[],
) {
  const preview = await previewCustomerImport(prisma, rows);
  const validRows = preview.filter((row) => row.isValid);
  if (validRows.length === 0) {
    throw new Error("NO_VALID_ROWS");
  }

  const salesUsers = await prisma.user.findMany({
    where: {
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
