import {
  CustomerStatus,
  CustomerType,
  DispatchStatus,
  DocumentationStatus,
  InvoiceHandoverStatus,
  ItemApprovalStatus,
  LotStatus,
  PaymentMode,
  PrismaClient,
  ProformaInvoiceStatus,
  QuotationStatus,
  ReceivedInAccount,
  SerialStatus,
  UserStatus,
} from "@prisma/client";
import {
  DEMO_COMPANY_CODE,
  DEMO_COMPANY_RECORD_LABEL,
  DEMO_CUSTOMER_CODE_PREFIX,
  DEMO_CUSTOMER_NAMES,
  DEMO_VENDOR_NAMES,
  demoCustomerWhere,
} from "@/lib/demo-mode";
import { getFinancialYear } from "@/lib/inventory";
import { addDays, toDateOnly } from "@/lib/quotations";
import { ROLES } from "@/lib/rbac";

export const DEMO_SAMPLE_CHAIN_COUNT = 5;

const SAMPLE_CITIES = ["Jalgaon", "Nashik", "Pune", "Aurangabad", "Dhule"] as const;

function userTag(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function padSeq(n: number): string {
  return String(n).padStart(5, "0");
}

async function resolveDemoProducts(client: PrismaClient) {
  const moduleProduct =
    (await client.product.findFirst({
      where: { displayName: "Modules - Longi - TOPCon - 590 Wp" },
    })) ??
    (await client.product.findFirst({
      where: { displayName: { startsWith: "Modules" }, isActive: true },
      orderBy: { displayName: "asc" },
    }));
  const inverterProduct =
    (await client.product.findFirst({
      where: { displayName: "Inverters - Growatt - 10 kW" },
    })) ??
    (await client.product.findFirst({
      where: { displayName: { startsWith: "Inverters" }, isActive: true },
      orderBy: { displayName: "asc" },
    }));
  return { moduleProduct, inverterProduct };
}

async function ensureDemoStock(
  client: PrismaClient,
  input: {
    companyId: string;
    warehouseId: string;
    moduleProductId: string;
    createdById: string;
    serialPrefix: string;
    quantity: number;
  },
) {
  const invoiceNo = `DEMO-INV-${input.serialPrefix}`;
  let lot = await client.inventoryLot.findFirst({
    where: { companyId: input.companyId, purchaseInvoiceNo: invoiceNo },
  });
  if (!lot) {
    lot = await client.inventoryLot.create({
      data: {
        lotNumber: `LOT-DEMO-${input.serialPrefix}-${Date.now().toString().slice(-6)}`,
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        purchaseInvoiceNo: invoiceNo,
        purchaseDate: new Date(),
        productId: input.moduleProductId,
        quantity: input.quantity,
        unitPurchaseRate: 8500,
        transportCharges: 0,
        commissionCharges: 0,
        totalPurchaseCost: 8500 * input.quantity,
        receivedQuantity: input.quantity,
        status: LotStatus.CLOSED,
        createdById: input.createdById,
      },
    });
  }

  const existingSerials = await client.inventorySerial.count({
    where: { lotId: lot.id },
  });
  if (existingSerials < input.quantity) {
    const start = existingSerials + 1;
    const serialNumbers = Array.from(
      { length: input.quantity - existingSerials },
      (_, index) => `${input.serialPrefix}-MOD-${String(start + index).padStart(4, "0")}`,
    );
    await client.inventorySerial.createMany({
      data: serialNumbers.map((serialNumber) => ({
        lotId: lot!.id,
        productId: input.moduleProductId,
        serialNumber,
        status: SerialStatus.AVAILABLE,
        currentWarehouseId: input.warehouseId,
      })),
      skipDuplicates: true,
    });
  }

  return lot;
}

/**
 * Ensures the 5 shared Demo Customer records (DEMO-CUST-001…005).
 * Idempotent; safe to re-run. Does not create or modify live ISE/PCMV customers.
 */
export async function ensureDemoCustomers(
  client: PrismaClient,
  demoUserId: string,
): Promise<Array<{ id: string; customerCode: string; customerName: string }>> {
  const customers = [];

  for (let i = 1; i <= DEMO_SAMPLE_CHAIN_COUNT; i++) {
    const seq = String(i).padStart(3, "0");
    const customerCode = `${DEMO_CUSTOMER_CODE_PREFIX}${seq}`;
    // Valid GST shape with DEMO marker so live filters never match these rows.
    const gstNumber = `27DEMOD${String(i).padStart(4, "0")}A1Z${i}`;
    const customerName = DEMO_CUSTOMER_NAMES[i - 1] ?? `Demo Customer ${i}`;
    const mobile = `9000000${String(i).padStart(3, "0")}`;
    const email = `demo.customer${i}@example.com`;

    const existingByCode = await client.customer.findUnique({
      where: { customerCode },
    });
    const existingByGst = existingByCode
      ? null
      : await client.customer.findUnique({ where: { gstNumber } });

    const customer = existingByCode
      ? await client.customer.update({
          where: { id: existingByCode.id },
          data: {
            customerName,
            contactPersonName: "Demo Contact",
            city: SAMPLE_CITIES[i - 1] ?? "Jalgaon",
            state: "Maharashtra",
            address: "Demo address — sample data only (not a live customer)",
            pinCode: "425001",
            mobile,
            email,
            status: CustomerStatus.ACTIVE,
            assignedSalesUserId: demoUserId,
            updatedById: demoUserId,
          },
        })
      : existingByGst
        ? await client.customer.update({
            where: { id: existingByGst.id },
            data: {
              customerCode,
              customerName,
              contactPersonName: "Demo Contact",
              city: SAMPLE_CITIES[i - 1] ?? "Jalgaon",
              state: "Maharashtra",
              address: "Demo address — sample data only (not a live customer)",
              pinCode: "425001",
              mobile,
              email,
              status: CustomerStatus.ACTIVE,
              assignedSalesUserId: demoUserId,
              updatedById: demoUserId,
            },
          })
        : await client.customer.create({
            data: {
              customerCode,
              customerName,
              contactPersonName: "Demo Contact",
              customerType: CustomerType.DEALER,
              gstNumber,
              address: "Demo address — sample data only (not a live customer)",
              city: SAMPLE_CITIES[i - 1] ?? "Jalgaon",
              state: "Maharashtra",
              pinCode: "425001",
              mobile,
              email,
              assignedSalesUserId: demoUserId,
              createdById: demoUserId,
              updatedById: demoUserId,
              status: CustomerStatus.ACTIVE,
              contacts: {
                create: {
                  name: "Demo Contact",
                  designation: "Owner",
                  mobile,
                  email,
                },
              },
            },
          });

    customers.push({
      id: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
    });
  }

  return customers;
}

/**
 * Ensures the 5 shared Demo Vendor records on the global vendor master.
 * Idempotent; safe to re-run. Does not create or modify live supplier rows.
 */
export async function ensureDemoVendors(
  client: PrismaClient,
): Promise<Array<{ id: string; vendorName: string }>> {
  const vendors = [];

  for (let i = 1; i <= DEMO_SAMPLE_CHAIN_COUNT; i++) {
    const vendorName = DEMO_VENDOR_NAMES[i - 1] ?? `Demo Vendor ${i}`;
    // Valid GST shape with DEMO marker so live filters never match these rows.
    const gst = `27DEMOV${String(i).padStart(4, "0")}A1Z${i}`;
    const mobile = `9100000${String(i).padStart(3, "0")}`;
    const email = `demo.vendor${i}@example.com`;
    const contactPerson = "Demo Supplier Contact";
    const address = "Demo supplier address — sample data only (not a live vendor)";

    const existingByGst = await client.vendor.findFirst({
      where: { gst },
    });
    const existingByName = existingByGst
      ? null
      : await client.vendor.findFirst({
          where: { vendorName: { equals: vendorName, mode: "insensitive" } },
        });

    const vendor = existingByGst
      ? await client.vendor.update({
          where: { id: existingByGst.id },
          data: {
            vendorName,
            address,
            contactPerson,
            mobile,
            email,
            isActive: true,
          },
        })
      : existingByName
        ? await client.vendor.update({
            where: { id: existingByName.id },
            data: {
              vendorName,
              gst,
              address,
              contactPerson,
              mobile,
              email,
              isActive: true,
            },
          })
        : await client.vendor.create({
            data: {
              vendorName,
              gst,
              address,
              contactPerson,
              mobile,
              email,
              isActive: true,
            },
          });

    vendors.push({ id: vendor.id, vendorName: vendor.vendorName });
  }

  return vendors;
}

/**
 * Detach live ISE/PCMV customers from demo users and hide legacy per-user demo
 * customer rows that are not the shared DEMO-CUST-001…005 set.
 */
export async function scrubLiveCustomersFromDemoUsers(
  client: PrismaClient,
): Promise<{ reassigned: number; inactivatedLegacy: number }> {
  const demoUsers = await client.user.findMany({
    where: { isDemo: true },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);
  if (demoUserIds.length === 0) {
    return { reassigned: 0, inactivatedLegacy: 0 };
  }

  const fallback = await client.user.findFirst({
    where: {
      isDemo: false,
      status: UserStatus.ACTIVE,
      roles: {
        some: {
          role: {
            name: {
              in: [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER, ROLES.SUPER_ADMIN],
            },
          },
        },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let reassigned = 0;
  if (fallback) {
    const liveOnDemo = await client.customer.findMany({
      where: {
        assignedSalesUserId: { in: demoUserIds },
        NOT: demoCustomerWhere(),
      },
      select: { id: true },
    });
    if (liveOnDemo.length) {
      const result = await client.customer.updateMany({
        where: { id: { in: liveOnDemo.map((c) => c.id) } },
        data: { assignedSalesUserId: fallback.id, updatedById: fallback.id },
      });
      reassigned = result.count;
    }
  }

  const legacy = await client.customer.updateMany({
    where: {
      AND: [
        demoCustomerWhere(),
        { NOT: { customerCode: { startsWith: DEMO_CUSTOMER_CODE_PREFIX, mode: "insensitive" } } },
      ],
    },
    data: { status: CustomerStatus.INACTIVE },
  });

  return { reassigned, inactivatedLegacy: legacy.count };
}

/**
 * Ensures 5 shared Demo Customers + 5 QT / PI / DC / documentation rows for one demo user.
 * Idempotent via stable document numbers scoped by user tag.
 */
export async function seedDemoUserSampleChain(
  client: PrismaClient,
  input: {
    demoUserId: string;
    companyId: string;
    warehouseId: string;
  },
): Promise<{ created: number; skipped: number }> {
  const { moduleProduct, inverterProduct } = await resolveDemoProducts(client);
  if (!moduleProduct || !inverterProduct) {
    throw new Error("DEMO_PRODUCTS_MISSING");
  }

  const tag = userTag(input.demoUserId);
  await ensureDemoStock(client, {
    companyId: input.companyId,
    warehouseId: input.warehouseId,
    moduleProductId: moduleProduct.id,
    createdById: input.demoUserId,
    serialPrefix: `DEMO-${tag}`,
    quantity: 80,
  });

  const demoCustomers = await ensureDemoCustomers(client, input.demoUserId);

  const quotationDate = toDateOnly(new Date());
  const expiryDate = toDateOnly(addDays(quotationDate, 7));
  const fy = getFinancialYear(quotationDate);

  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= DEMO_SAMPLE_CHAIN_COUNT; i++) {
    const seq = padSeq(i);
    const customer = demoCustomers[i - 1];
    if (!customer) {
      throw new Error("DEMO_CUSTOMERS_MISSING");
    }

    const quotationNo = `${DEMO_COMPANY_CODE}-QT-${fy}-${tag}-${seq}`;
    const piNo = `${DEMO_COMPANY_CODE}-PI-${fy}-${tag}-${seq}`;
    const dcNo = `${DEMO_COMPANY_CODE}-DC-${fy}-${tag}-${seq}`;

    const existingDc = await client.dispatch.findFirst({ where: { dcNo } });
    if (existingDc) {
      skipped += 1;
      continue;
    }

    const moduleQty = 10 + i * 2;
    const moduleLine = Math.round(moduleQty * 22 * 1.12);
    const inverterLine = Math.round(52000 * 1.12);
    const totalValue = moduleLine + inverterLine;

    let quotation = await client.quotation.findFirst({
      where: { quotationNo },
      include: { items: true },
    });
    if (!quotation) {
      quotation = await client.quotation.create({
        data: {
          quotationNo,
          companyId: input.companyId,
          customerId: customer.id,
          salesUserId: input.demoUserId,
          status: QuotationStatus.SENT,
          revisionNo: 1,
          quotationDate,
          expiryDate,
          totalValue,
          notes: `${DEMO_COMPANY_RECORD_LABEL} — sample quotation ${i}`,
          items: {
            create: [
              {
                productId: moduleProduct.id,
                qty: moduleQty,
                rate: 22,
                gstRate: 12,
                lineTotal: moduleLine,
                approvalStatus: ItemApprovalStatus.AUTO,
              },
              {
                productId: inverterProduct.id,
                qty: 1,
                rate: 52000,
                gstRate: 12,
                lineTotal: inverterLine,
                approvalStatus: ItemApprovalStatus.AUTO,
              },
            ],
          },
        },
        include: { items: true },
      });
    }

    let pi = await client.proformaInvoice.findFirst({
      where: { piNo },
      include: { items: true },
    });
    if (!pi) {
      pi = await client.proformaInvoice.create({
        data: {
          piNo,
          companyId: input.companyId,
          customerId: customer.id,
          salesUserId: input.demoUserId,
          quotationId: quotation.id,
          warehouseId: input.warehouseId,
          status: ProformaInvoiceStatus.BOOKED,
          piDate: quotationDate,
          totalValue: quotation.totalValue,
          bookedAt: new Date(),
          bookedById: input.demoUserId,
          notes: `${DEMO_COMPANY_RECORD_LABEL} — sample PI ${i}`,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              rate: item.rate,
              gstRate: item.gstRate,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: { items: true },
      });

      if (quotation.status !== QuotationStatus.CONVERTED) {
        await client.quotation.update({
          where: { id: quotation.id },
          data: { status: QuotationStatus.CONVERTED },
        });
      }

      const existingPay = await client.payment.findFirst({
        where: { referenceNo: `DEMO-PAY-${tag}-${seq}` },
      });
      if (!existingPay) {
        await client.payment.create({
          data: {
            companyId: input.companyId,
            customerId: customer.id,
            proformaInvoiceId: pi.id,
            amount: quotation.totalValue,
            paymentDate: quotationDate,
            paymentMode: PaymentMode.NEFT,
            receivedInAccount: ReceivedInAccount.SBI,
            referenceNo: `DEMO-PAY-${tag}-${seq}`,
            recordedById: input.demoUserId,
            notes: `${DEMO_COMPANY_RECORD_LABEL} — sample payment ${i}`,
          },
        });
      }
    }

    const piItem =
      pi.items.find((row) => row.productId === moduleProduct.id) ?? pi.items[0];
    if (!piItem) {
      created += 1;
      continue;
    }

    const dispatchQty = Math.min(Number(piItem.qty), 8);
    const availableSerials = await client.inventorySerial.findMany({
      where: {
        productId: moduleProduct.id,
        currentWarehouseId: input.warehouseId,
        status: SerialStatus.AVAILABLE,
        serialNumber: { startsWith: `DEMO-${tag}-MOD-` },
      },
      take: dispatchQty,
      orderBy: { createdAt: "asc" },
    });

    const dispatch = await client.dispatch.create({
      data: {
        dcNo,
        companyId: input.companyId,
        customerId: customer.id,
        proformaInvoiceId: pi.id,
        warehouseId: input.warehouseId,
        status: DispatchStatus.DISPATCHED,
        dispatchDate: quotationDate,
        vehicleNo: `MH-19-D${tag.slice(0, 2)}-${i}`,
        driverName: "Demo Driver",
        receiverName: "Sample Receiver",
        receiverMobile: "9000001999",
        createdById: input.demoUserId,
        dispatchedById: input.demoUserId,
        dispatchedAt: new Date(),
        notes: `${DEMO_COMPANY_RECORD_LABEL} — sample dispatch ${i}`,
        lines: {
          create: [
            {
              proformaInvoiceItemId: piItem.id,
              productId: piItem.productId,
              qty: availableSerials.length || dispatchQty,
              serials: availableSerials.length
                ? {
                    create: availableSerials.map((serial) => ({
                      serialId: serial.id,
                    })),
                  }
                : undefined,
            },
          ],
        },
      },
    });

    if (availableSerials.length) {
      await client.inventorySerial.updateMany({
        where: { id: { in: availableSerials.map((s) => s.id) } },
        data: { status: SerialStatus.DISPATCHED },
      });
    }

    const handover = await client.invoiceHandover.create({
      data: {
        dispatchId: dispatch.id,
        companyId: input.companyId,
        customerId: customer.id,
        status: InvoiceHandoverStatus.INVOICE_RECORDED,
        invoiceNumber: `DEMO-TAX-${fy}-${tag}-${seq}`,
        invoiceDate: quotationDate,
        recordedById: input.demoUserId,
        recordedAt: new Date(),
        remarks: `${DEMO_COMPANY_RECORD_LABEL} — sample invoice ${i}`,
      },
    });

    await client.documentationRecord.create({
      data: {
        dispatchId: dispatch.id,
        invoiceHandoverId: handover.id,
        companyId: input.companyId,
        customerId: customer.id,
        status: DocumentationStatus.PENDING,
        assignedToId: input.demoUserId,
        assignedDate: quotationDate,
        remarks: `${DEMO_COMPANY_RECORD_LABEL} — sample documentation ${i}`,
      },
    });

    created += 1;
  }

  await client.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: input.companyId,
        documentType: "QUOTATION",
        financialYear: fy,
      },
    },
    create: {
      companyId: input.companyId,
      documentType: "QUOTATION",
      financialYear: fy,
      lastSequence: DEMO_SAMPLE_CHAIN_COUNT,
    },
    update: { lastSequence: DEMO_SAMPLE_CHAIN_COUNT },
  });
  await client.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: input.companyId,
        documentType: "PROFORMA_INVOICE",
        financialYear: fy,
      },
    },
    create: {
      companyId: input.companyId,
      documentType: "PROFORMA_INVOICE",
      financialYear: fy,
      lastSequence: DEMO_SAMPLE_CHAIN_COUNT,
    },
    update: { lastSequence: DEMO_SAMPLE_CHAIN_COUNT },
  });
  await client.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: input.companyId,
        documentType: "DISPATCH",
        financialYear: fy,
      },
    },
    create: {
      companyId: input.companyId,
      documentType: "DISPATCH",
      financialYear: fy,
      lastSequence: DEMO_SAMPLE_CHAIN_COUNT,
    },
    update: { lastSequence: DEMO_SAMPLE_CHAIN_COUNT },
  });

  return { created, skipped };
}

/**
 * Reassign demo-user FKs to a fallback demo user so Super Admin can hard-delete.
 */
export async function reassignDemoUserOwnership(
  client: PrismaClient,
  fromUserId: string,
  toUserId: string,
) {
  if (fromUserId === toUserId) return;

  await client.$transaction(async (tx) => {
    await tx.customer.updateMany({
      where: { assignedSalesUserId: fromUserId },
      data: { assignedSalesUserId: toUserId },
    });
    await tx.customer.updateMany({
      where: { createdById: fromUserId },
      data: { createdById: toUserId },
    });
    await tx.customer.updateMany({
      where: { updatedById: fromUserId },
      data: { updatedById: toUserId },
    });
    await tx.quotation.updateMany({
      where: { salesUserId: fromUserId },
      data: { salesUserId: toUserId },
    });
    await tx.proformaInvoice.updateMany({
      where: { salesUserId: fromUserId },
      data: { salesUserId: toUserId },
    });
    await tx.proformaInvoice.updateMany({
      where: { bookedById: fromUserId },
      data: { bookedById: toUserId },
    });
    await tx.payment.updateMany({
      where: { recordedById: fromUserId },
      data: { recordedById: toUserId },
    });
    await tx.dispatch.updateMany({
      where: { createdById: fromUserId },
      data: { createdById: toUserId },
    });
    await tx.dispatch.updateMany({
      where: { dispatchedById: fromUserId },
      data: { dispatchedById: toUserId },
    });
    await tx.invoiceHandover.updateMany({
      where: { recordedById: fromUserId },
      data: { recordedById: toUserId },
    });
    await tx.documentationRecord.updateMany({
      where: { assignedToId: fromUserId },
      data: { assignedToId: toUserId },
    });
    await tx.documentationRecord.updateMany({
      where: { completedById: fromUserId },
      data: { completedById: toUserId },
    });
    await tx.inventoryLot.updateMany({
      where: { createdById: fromUserId },
      data: { createdById: toUserId },
    });
    await tx.salesModuleTarget.updateMany({
      where: { createdById: fromUserId },
      data: { createdById: toUserId },
    });
    await tx.salesModuleTarget.updateMany({
      where: { updatedById: fromUserId },
      data: { updatedById: toUserId },
    });
    await tx.auditLog.updateMany({
      where: { performedBy: fromUserId },
      data: { performedBy: null },
    });
    await tx.approvalRequest.updateMany({
      where: { requestedById: fromUserId },
      data: { requestedById: toUserId },
    });
    await tx.approvalRequest.updateMany({
      where: { approvedById: fromUserId },
      data: { approvedById: toUserId },
    });
    await tx.learningProgress.deleteMany({ where: { userId: fromUserId } });
    await tx.notification.deleteMany({ where: { userId: fromUserId } });
  });
}
