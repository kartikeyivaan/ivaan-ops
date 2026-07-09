import bcrypt from "bcryptjs";
import { ISE_BANK_DETAILS } from "../src/lib/proposal-pdf-content";
import {
  CapacityUnit,
  DispatchStatus,
  InventoryTransactionType,
  LotStatus,
  PaymentMode,
  PricingType,
  PrismaClient,
  ProformaInvoiceStatus,
  QuotationStatus,
  ItemApprovalStatus,
  SerialStatus,
  UserStatus,
} from "@prisma/client";
import { ROLES } from "../src/lib/rbac";
import { PRODUCT_CATEGORY_NAMES } from "../src/lib/products";
import { generateLotNumber, getFinancialYear } from "../src/lib/inventory";
import { addDays, toDateOnly } from "../src/lib/quotations";
import { seedProjectProposalMasters } from "./seed-project-proposal-masters";

const prisma = new PrismaClient();

async function main() {
  const roles = await Promise.all(
    Object.values(ROLES).map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name, description: `${name} role` },
      }),
    ),
  );

  const roleMap = Object.fromEntries(roles.map((role) => [role.name, role.id]));

  await seedProjectProposalMasters(prisma);

  const defaultTerms = [
    "Payment: 100% advance payment is required prior to dispatch of goods.",
    "Taxes: GST and other applicable taxes shall be charged as per prevailing government norms.",
    "Transportation: Transportation charges are extra, at actual cost. Unloading and transit insurance are in the client's scope.",
    "Warranty: Warranty is as per respective OEM / manufacturer terms and conditions.",
    "Order Cancellation: Cancellation after order confirmation attracts charges of 5% of the total PI / Invoice value.",
    "Inspection of Goods: Fragile or damage-prone items must be inspected at the time of dispatch / delivery. No claims for transit or handling damage shall be entertained after dispatch.",
    "Quotation Validity: This quotation is valid for the period stated on the document. Prices and availability are subject to revision thereafter.",
    "Delivery: Delivery timelines are indicative and subject to stock availability and logistics conditions.",
    "Title & Risk: Title and risk in the goods pass to the client upon dispatch from our warehouse.",
  ].join("\n");

  const iseProfile = {
    name: "Ivaan Solar Energy",
    address: "Waaree Solar Center, Opp. K. U. Kolhe School,\nOld Nashirabad Road, Near Kalika Mata Mandir Chowk",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 8888 555 832",
    email: "connect@ivaansolar.com",
    gstNumber: "27AAJFI3520N1Z5",
    tagline: "Authorised Waaree Franchise",
    bankDetails: ISE_BANK_DETAILS,
    termsAndConditions: defaultTerms,
  };
  const pcmvProfile = {
    name: "PCM Ventures",
    address: "Opp. K. U. Kolhe School, Old Nashirabad Road,\nNear Kalika Mata Mandir Chowk",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 7385 1589 47",
    email: "pcmventures@outlook.com",
    gstNumber: "27ABHFP7656F1ZU",
    tagline: null,
    bankDetails:
      "Bank: State Bank of India\nA/c No: 44431999106   IFSC: SBIN0018300\nUPI: pcmventures@sbi\nBranch: Kalika Mandir, Jalgaon",
    termsAndConditions: defaultTerms,
  };

  const ise = await prisma.company.upsert({
    where: { code: "ISE" },
    update: iseProfile,
    create: { code: "ISE", ...iseProfile },
  });

  const pcmv = await prisma.company.upsert({
    where: { code: "PCMV" },
    update: pcmvProfile,
    create: { code: "PCMV", ...pcmvProfile },
  });

  const warehouses = [
    { companyId: ise.id, name: "Jalgaon HO", code: "JAL-HO" },
    { companyId: ise.id, name: "Jalgaon Projects", code: "JAL-PRJ" },
    { companyId: pcmv.id, name: "Jalgaon HO", code: "JAL-HO" },
  ];

  for (const warehouse of warehouses) {
    const existing = await prisma.warehouse.findFirst({
      where: {
        companyId: warehouse.companyId,
        name: warehouse.name,
      },
    });
    if (!existing) {
      await prisma.warehouse.create({ data: warehouse });
    }
  }

  const passwordHash = await bcrypt.hash("Admin@123", 12);

  const seedPasswordMeta = {
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  };

  function seedUserUpdate(passwordHash: string) {
    return {
      passwordHash,
      ...seedPasswordMeta,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
  }

  const admin = await prisma.user.upsert({
    where: { email: "admin@ivaansolar.com" },
    update: seedUserUpdate(passwordHash),
    create: {
      name: "Super Admin",
      email: "admin@ivaansolar.com",
      officialContactNumber: "9999999999",
      passwordHash,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.SUPER_ADMIN] }],
      },
      companies: {
        create: [{ companyId: ise.id }, { companyId: pcmv.id }],
      },
    },
  });

  const kartikeyPassword = await bcrypt.hash("Kartik@123", 12);
  await prisma.user.upsert({
    where: { email: "kartikey.ivaan@gmail.com" },
    update: seedUserUpdate(kartikeyPassword),
    create: {
      name: "Kartikey",
      email: "kartikey.ivaan@gmail.com",
      officialContactNumber: "7385158947",
      passwordHash: kartikeyPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.SUPER_ADMIN] }],
      },
      companies: {
        create: [{ companyId: ise.id }, { companyId: pcmv.id }],
      },
    },
  });

  const salesManagerPassword = await bcrypt.hash("Manager@123", 12);
  const salesManager = await prisma.user.upsert({
    where: { email: "manager@ivaansolar.com" },
    update: seedUserUpdate(salesManagerPassword),
    create: {
      name: "Sales Manager",
      email: "manager@ivaansolar.com",
      passwordHash: salesManagerPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.SALES_MANAGER] }],
      },
      companies: {
        create: [{ companyId: ise.id }, { companyId: pcmv.id }],
      },
    },
  });

  const salesExecPassword = await bcrypt.hash("Sales@123", 12);
  const salesExecutive = await prisma.user.upsert({
    where: { email: "sales@ivaansolar.com" },
    update: seedUserUpdate(salesExecPassword),
    create: {
      name: "Sales Executive",
      email: "sales@ivaansolar.com",
      passwordHash: salesExecPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.SALES_EXECUTIVE] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  const projectsManagerPassword = await bcrypt.hash("ProjectsManager@123", 12);
  await prisma.user.upsert({
    where: { email: "projects.manager@ivaansolar.com" },
    update: seedUserUpdate(projectsManagerPassword),
    create: {
      name: "Projects Manager",
      email: "projects.manager@ivaansolar.com",
      passwordHash: projectsManagerPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.PROJECTS_MANAGER] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  const projectsSalesPassword = await bcrypt.hash("ProjectsSales@123", 12);
  await prisma.user.upsert({
    where: { email: "projects.sales@ivaansolar.com" },
    update: seedUserUpdate(projectsSalesPassword),
    create: {
      name: "Projects Sales Executive",
      email: "projects.sales@ivaansolar.com",
      passwordHash: projectsSalesPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.PROJECTS_SALES_EXECUTIVE] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  const warehousePassword = await bcrypt.hash("Warehouse@123", 12);
  await prisma.user.upsert({
    where: { email: "warehouse@ivaansolar.com" },
    update: seedUserUpdate(warehousePassword),
    create: {
      name: "Warehouse Manager",
      email: "warehouse@ivaansolar.com",
      passwordHash: warehousePassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.WAREHOUSE] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  const purchasePassword = await bcrypt.hash("Purchase@123", 12);
  const purchaseUser = await prisma.user.upsert({
    where: { email: "purchase@ivaansolar.com" },
    update: seedUserUpdate(purchasePassword),
    create: {
      name: "Purchase Manager",
      email: "purchase@ivaansolar.com",
      passwordHash: purchasePassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.PURCHASE] }],
      },
      companies: {
        create: [{ companyId: ise.id }, { companyId: pcmv.id }],
      },
    },
  });

  const accountsPassword = await bcrypt.hash("Accounts@123", 12);
  const accountsUser = await prisma.user.upsert({
    where: { email: "accounts@ivaansolar.com" },
    update: seedUserUpdate(accountsPassword),
    create: {
      name: "Accounts Manager",
      email: "accounts@ivaansolar.com",
      passwordHash: accountsPassword,
      ...seedPasswordMeta,
      roles: {
        create: [{ roleId: roleMap[ROLES.ACCOUNTS] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: admin.id,
      title: "Welcome to IvaanOps",
      message: "Foundation module seeded successfully.",
      module: "foundation",
    },
  });

  const sampleCustomers = [
    {
      customerCode: "CUST-00001",
      customerName: "Sunrise Solar Dealers",
      customerType: "DEALER" as const,
      gstNumber: "27AABCI1234A1Z5",
      city: "Jalgaon",
      state: "Maharashtra",
      mobile: "9876500001",
      email: "sunrise@example.com",
      assignedSalesUserId: salesExecutive.id,
      createdById: admin.id,
    },
    {
      customerCode: "CUST-00002",
      customerName: "Greenfield Projects Pvt Ltd",
      customerType: "PROJECT" as const,
      gstNumber: "27AABCI5678B2Z6",
      city: "Pune",
      state: "Maharashtra",
      mobile: "9876500002",
      email: "greenfield@example.com",
      assignedSalesUserId: salesManager.id,
      createdById: admin.id,
    },
    {
      customerCode: "CUST-00003",
      customerName: "Western Electricals",
      customerType: "DEALER" as const,
      gstNumber: "27AABCI9012C3Z7",
      city: "Nashik",
      state: "Maharashtra",
      mobile: "9876500003",
      email: "western@example.com",
      assignedSalesUserId: salesManager.id,
      createdById: admin.id,
    },
  ];

  for (const customer of sampleCustomers) {
    await prisma.customer.upsert({
      where: { gstNumber: customer.gstNumber },
      update: {},
      create: {
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        customerType: customer.customerType,
        gstNumber: customer.gstNumber,
        city: customer.city,
        state: customer.state,
        mobile: customer.mobile,
        email: customer.email,
        assignedSalesUserId: customer.assignedSalesUserId,
        createdById: customer.createdById,
        contacts: {
          create: {
            name: "Primary Contact",
            designation: "Owner",
            mobile: customer.mobile,
            email: customer.email,
          },
        },
      },
    });
  }

  for (const name of PRODUCT_CATEGORY_NAMES) {
    await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const brands = ["Longi", "Tata Power Solar", "Growatt", "Polycab"];
  for (const name of brands) {
    await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const technologies = ["TOPCon", "Mono PERC", "DCR", "Non-DCR"];
  for (const name of technologies) {
    await prisma.productTechnology.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const modulesCategory = await prisma.productCategory.findUniqueOrThrow({
    where: { name: "Modules" },
  });
  const invertersCategory = await prisma.productCategory.findUniqueOrThrow({
    where: { name: "Inverters" },
  });
  const otherCategory = await prisma.productCategory.findUniqueOrThrow({
    where: { name: "Other" },
  });
  const longi = await prisma.brand.findUniqueOrThrow({ where: { name: "Longi" } });
  const growatt = await prisma.brand.findUniqueOrThrow({ where: { name: "Growatt" } });
  const polycab = await prisma.brand.findUniqueOrThrow({ where: { name: "Polycab" } });
  const topcon = await prisma.productTechnology.findUniqueOrThrow({
    where: { name: "TOPCon" },
  });

  const sampleProducts = [
    {
      key: "module-590",
      categoryId: modulesCategory.id,
      brandId: longi.id,
      technologyId: topcon.id,
      capacity: 590,
      capacityUnit: CapacityUnit.WP,
      displayName: "Modules - Longi - TOPCon - 590 Wp",
      pricingType: PricingType.WP,
      hsn: "85414011",
      gstRate: 12,
      serialTracking: true,
      price: { landingCost: 18, standardPrice: 22, minimumPrice: 20 },
    },
    {
      key: "inverter-10kw",
      categoryId: invertersCategory.id,
      brandId: growatt.id,
      technologyId: null,
      capacity: 10,
      capacityUnit: CapacityUnit.KW,
      displayName: "Inverters - Growatt - 10 kW",
      pricingType: PricingType.UNIT,
      hsn: "85044090",
      gstRate: 12,
      serialTracking: true,
      price: { landingCost: 45000, standardPrice: 52000, minimumPrice: 48000 },
    },
    {
      key: "cable-4sq",
      categoryId: otherCategory.id,
      brandId: polycab.id,
      technologyId: null,
      capacity: 1,
      capacityUnit: CapacityUnit.METER,
      displayName: "Other - Polycab - 1 Meter",
      pricingType: PricingType.UNIT,
      hsn: "85444999",
      gstRate: 18,
      serialTracking: false,
      price: { landingCost: 45, standardPrice: 65, minimumPrice: 55 },
    },
  ];

  for (const item of sampleProducts) {
    let product = await prisma.product.findFirst({
      where: { displayName: item.displayName },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          categoryId: item.categoryId,
          brandId: item.brandId,
          technologyId: item.technologyId,
          capacity: item.capacity,
          capacityUnit: item.capacityUnit,
          displayName: item.displayName,
          pricingType: item.pricingType,
          hsn: item.hsn,
          gstRate: item.gstRate,
          serialTracking: item.serialTracking,
        },
      });
    }

    const existingPrice = await prisma.productPrice.findFirst({
      where: {
        productId: product.id,
        effectiveTo: null,
      },
    });

    if (!existingPrice) {
      await prisma.productPrice.create({
        data: {
          productId: product.id,
          landingCost: item.price.landingCost,
          standardPrice: item.price.standardPrice,
          minimumPrice: item.price.minimumPrice,
          effectiveFrom: new Date(),
        },
      });
    }
  }

  const vendor = await prisma.vendor.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      vendorName: "Tata Power Solar Distributor",
      gst: "27AABCT1234A1Z5",
      contactPerson: "Vendor Contact",
      mobile: "9876500100",
      email: "vendor@example.com",
    },
  });

  const moduleProduct = await prisma.product.findFirst({
    where: { displayName: "Modules - Longi - TOPCon - 590 Wp" },
  });
  const iseWarehouse = await prisma.warehouse.findFirst({
    where: { companyId: ise.id, name: "Jalgaon HO" },
  });

  if (moduleProduct && iseWarehouse) {
    const existingLot = await prisma.inventoryLot.findFirst({
      where: { lotNumber: { startsWith: "LOT-" } },
    });

    if (!existingLot) {
      const lotNumber = await generateLotNumber(prisma);
      const incomingLot = await prisma.inventoryLot.create({
        data: {
          lotNumber,
          companyId: ise.id,
          warehouseId: iseWarehouse.id,
          vendorId: vendor.id,
          purchaseInvoiceNo: "INV-SEED-001",
          purchaseDate: new Date(),
          productId: moduleProduct.id,
          quantity: 100,
          unitPurchaseRate: 8500,
          transportCharges: 2500,
          commissionCharges: 1000,
          totalPurchaseCost: 853500,
          status: LotStatus.INCOMING,
          createdById: purchaseUser.id,
        },
      });

      const stockLotNumber = await generateLotNumber(prisma);
      const stockLot = await prisma.inventoryLot.create({
        data: {
          lotNumber: stockLotNumber,
          companyId: ise.id,
          warehouseId: iseWarehouse.id,
          vendorId: vendor.id,
          purchaseInvoiceNo: "INV-SEED-002",
          purchaseDate: new Date(),
          productId: moduleProduct.id,
          quantity: 20,
          unitPurchaseRate: 8500,
          transportCharges: 500,
          commissionCharges: 0,
          totalPurchaseCost: 170500,
          receivedQuantity: 20,
          status: LotStatus.CLOSED,
          createdById: purchaseUser.id,
        },
      });

      const serialNumbers = Array.from({ length: 20 }, (_, index) =>
        `MOD-LONGI-${String(index + 1).padStart(4, "0")}`,
      );

      await prisma.inventorySerial.createMany({
        data: serialNumbers.map((serialNumber) => ({
          lotId: stockLot.id,
          productId: moduleProduct.id,
          serialNumber,
          status: SerialStatus.AVAILABLE,
          currentWarehouseId: iseWarehouse.id,
        })),
        skipDuplicates: true,
      });

      const cableProduct = await prisma.product.findFirst({
        where: { displayName: "Other - Polycab - 1 Meter" },
      });

      if (cableProduct) {
        const cableLotNumber = await generateLotNumber(prisma);
        await prisma.inventoryLot.create({
          data: {
            lotNumber: cableLotNumber,
            companyId: ise.id,
            warehouseId: iseWarehouse.id,
            purchaseDate: new Date(),
            productId: cableProduct.id,
            quantity: 500,
            unitPurchaseRate: 120,
            transportCharges: 0,
            commissionCharges: 0,
            totalPurchaseCost: 60000,
            receivedQuantity: 500,
            status: LotStatus.CLOSED,
            createdById: purchaseUser.id,
          },
        });
      }

      void incomingLot;
    }
  }

  await seedSampleQuotations();
  await seedSampleProformaInvoices();
  await seedSampleDispatches();

  console.log("Seed completed.");
  console.log("Admin login: admin@ivaansolar.com / Admin@123");
  console.log("Sales Manager login: manager@ivaansolar.com / Manager@123");
  console.log("Sales Executive login: sales@ivaansolar.com / Sales@123");
  console.log("Purchase login: purchase@ivaansolar.com / Purchase@123");
  console.log("Warehouse login: warehouse@ivaansolar.com / Warehouse@123");
  console.log("Accounts login: accounts@ivaansolar.com / Accounts@123");
}

async function seedSampleQuotations() {
  const ise = await prisma.company.findUniqueOrThrow({ where: { code: "ISE" } });
  const customer = await prisma.customer.findFirst({
    where: { customerCode: "CUST-00001" },
  });
  const salesExecutive = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@ivaansolar.com" },
  });
  const moduleProduct = await prisma.product.findFirst({
    where: { displayName: "Modules - Longi - TOPCon - 590 Wp" },
  });
  const inverterProduct = await prisma.product.findFirst({
    where: { displayName: "Inverters - Growatt - 10 kW" },
  });

  if (!customer || !moduleProduct || !inverterProduct) return;

  const quotationDate = toDateOnly(new Date());
  const expiryDate = toDateOnly(addDays(quotationDate, 3));
  const fy = getFinancialYear(quotationDate);

  const existing = await prisma.quotation.findFirst({
    where: { quotationNo: `${ise.code}-QT-${fy}-00001` },
  });
  if (existing) return;

  await prisma.quotation.create({
    data: {
      quotationNo: `${ise.code}-QT-${fy}-00001`,
      companyId: ise.id,
      customerId: customer.id,
      salesUserId: salesExecutive.id,
      status: QuotationStatus.SENT,
      revisionNo: 1,
      quotationDate,
      expiryDate,
      totalValue: 1596960,
      notes: "Sample seeded quotation for UAT",
      items: {
        create: [
          {
            productId: moduleProduct.id,
            qty: 100,
            rate: 22,
            gstRate: 12,
            lineTotal: 1461920,
            approvalStatus: ItemApprovalStatus.AUTO,
          },
          {
            productId: inverterProduct.id,
            qty: 2,
            rate: 52000,
            gstRate: 12,
            lineTotal: 116480,
            approvalStatus: ItemApprovalStatus.AUTO,
          },
        ],
      },
    },
  });

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: ise.id,
        documentType: "QUOTATION",
        financialYear: fy,
      },
    },
    create: {
      companyId: ise.id,
      documentType: "QUOTATION",
      financialYear: fy,
      lastSequence: 1,
    },
    update: { lastSequence: 1 },
  });

  const pendingCustomer = await prisma.customer.findFirst({
    where: { customerCode: "CUST-00002" },
  });

  if (pendingCustomer) {
    const pendingQuotation = await prisma.quotation.create({
      data: {
        quotationNo: `${ise.code}-QT-${fy}-00002`,
        companyId: ise.id,
        customerId: pendingCustomer.id,
        salesUserId: salesExecutive.id,
        status: QuotationStatus.DRAFT,
        revisionNo: 1,
        quotationDate,
        expiryDate,
        totalValue: 1310400,
        items: {
          create: [
            {
              productId: moduleProduct.id,
              qty: 100,
              rate: 19,
              gstRate: 12,
              lineTotal: 1262240,
              approvalStatus: ItemApprovalStatus.PENDING,
            },
          ],
        },
      },
    });

    await prisma.documentSequence.update({
      where: {
        companyId_documentType_financialYear: {
          companyId: ise.id,
          documentType: "QUOTATION",
          financialYear: fy,
        },
      },
      data: { lastSequence: 2 },
    });

    await prisma.approvalRequest.create({
      data: {
        moduleType: "QUOTATION",
        moduleId: pendingQuotation.id,
        requestedById: salesExecutive.id,
        status: "PENDING",
      },
    });
  }
}

async function seedSampleProformaInvoices() {
  const ise = await prisma.company.findUniqueOrThrow({ where: { code: "ISE" } });
  const customer = await prisma.customer.findFirst({
    where: { customerCode: "CUST-00001" },
  });
  const salesExecutive = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@ivaansolar.com" },
  });
  const accountsUser = await prisma.user.findUniqueOrThrow({
    where: { email: "accounts@ivaansolar.com" },
  });
  const quotation = await prisma.quotation.findFirst({
    where: { quotationNo: { contains: `${ise.code}-QT-` }, status: QuotationStatus.SENT },
    include: { items: true },
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: ise.id, name: "Jalgaon HO" },
  });

  if (!customer || !quotation || !warehouse) return;

  const piDate = toDateOnly(new Date());
  const fy = getFinancialYear(piDate);
  const piNo = `${ise.code}-PI-${fy}-00001`;

  const existing = await prisma.proformaInvoice.findFirst({ where: { piNo } });
  if (existing) return;

  const pi = await prisma.proformaInvoice.create({
    data: {
      piNo,
      companyId: ise.id,
      customerId: customer.id,
      salesUserId: salesExecutive.id,
      quotationId: quotation.id,
      status: ProformaInvoiceStatus.ISSUED,
      piDate,
      totalValue: quotation.totalValue,
      notes: "Seeded PI converted from sample quotation",
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
  });

  await prisma.quotation.update({
    where: { id: quotation.id },
    data: { status: QuotationStatus.CONVERTED },
  });

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: ise.id,
        documentType: "PROFORMA_INVOICE",
        financialYear: fy,
      },
    },
    create: {
      companyId: ise.id,
      documentType: "PROFORMA_INVOICE",
      financialYear: fy,
      lastSequence: 1,
    },
    update: { lastSequence: 1 },
  });

  await prisma.payment.create({
    data: {
      companyId: ise.id,
      customerId: customer.id,
      proformaInvoiceId: pi.id,
      amount: 798480,
      paymentDate: piDate,
      paymentMode: PaymentMode.NEFT,
      referenceNo: "SEED-PAY-001",
      recordedById: accountsUser.id,
      notes: "50% advance for booking eligibility UAT",
    },
  });

  const pendingPi = await prisma.proformaInvoice.create({
    data: {
      piNo: `${ise.code}-PI-${fy}-00002`,
      companyId: ise.id,
      customerId: customer.id,
      salesUserId: salesExecutive.id,
      warehouseId: warehouse.id,
      status: ProformaInvoiceStatus.PENDING_BOOKING,
      piDate,
      totalValue: 292384,
      items: {
        create: quotation.items.slice(0, 1).map((item) => ({
          productId: item.productId,
          qty: 20,
          rate: item.rate,
          gstRate: item.gstRate,
          lineTotal: 292384,
        })),
      },
    },
  });

  await prisma.documentSequence.update({
    where: {
      companyId_documentType_financialYear: {
        companyId: ise.id,
        documentType: "PROFORMA_INVOICE",
        financialYear: fy,
      },
    },
    data: { lastSequence: 2 },
  });

  await prisma.payment.create({
    data: {
      companyId: ise.id,
      customerId: customer.id,
      proformaInvoiceId: pendingPi.id,
      amount: 146192,
      paymentDate: piDate,
      paymentMode: PaymentMode.BANK_TRANSFER,
      referenceNo: "SEED-PAY-002",
      recordedById: accountsUser.id,
    },
  });

  await prisma.approvalRequest.create({
    data: {
      moduleType: "BOOKING",
      moduleId: pendingPi.id,
      requestedById: salesExecutive.id,
      status: "PENDING",
    },
  });

  void accountsUser;
}

async function seedSampleDispatches() {
  const ise = await prisma.company.findUniqueOrThrow({ where: { code: "ISE" } });
  const customer = await prisma.customer.findFirst({
    where: { customerCode: "CUST-00001" },
  });
  const salesExecutive = await prisma.user.findUniqueOrThrow({
    where: { email: "sales@ivaansolar.com" },
  });
  const manager = await prisma.user.findUniqueOrThrow({
    where: { email: "manager@ivaansolar.com" },
  });
  const warehouseUser = await prisma.user.findUniqueOrThrow({
    where: { email: "warehouse@ivaansolar.com" },
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: ise.id, name: "Jalgaon HO" },
  });
  const moduleProduct = await prisma.product.findFirst({
    where: { displayName: "Modules - Longi - TOPCon - 590 Wp" },
  });

  if (!customer || !warehouse || !moduleProduct) return;

  const piDate = toDateOnly(new Date());
  const fy = getFinancialYear(piDate);
  const bookedPiNo = `${ise.code}-PI-${fy}-00003`;

  let bookedPi = await prisma.proformaInvoice.findFirst({ where: { piNo: bookedPiNo } });
  if (!bookedPi) {
    const newPi = await prisma.proformaInvoice.create({
      data: {
        piNo: bookedPiNo,
        companyId: ise.id,
        customerId: customer.id,
        salesUserId: salesExecutive.id,
        warehouseId: warehouse.id,
        status: ProformaInvoiceStatus.BOOKED,
        piDate,
        totalValue: 1461920,
        bookedAt: new Date(),
        bookedById: manager.id,
        items: {
          create: [
            {
              productId: moduleProduct.id,
              qty: 20,
              rate: 22,
              gstRate: 12,
              lineTotal: 292384,
            },
          ],
        },
      },
      include: { items: true },
    });
    bookedPi = newPi;

    await prisma.documentSequence.upsert({
      where: {
        companyId_documentType_financialYear: {
          companyId: ise.id,
          documentType: "PROFORMA_INVOICE",
          financialYear: fy,
        },
      },
      create: {
        companyId: ise.id,
        documentType: "PROFORMA_INVOICE",
        financialYear: fy,
        lastSequence: 3,
      },
      update: { lastSequence: 3 },
    });

    const serials = await prisma.inventorySerial.findMany({
      where: {
        productId: moduleProduct.id,
        currentWarehouseId: warehouse.id,
        status: SerialStatus.AVAILABLE,
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    if (serials.length >= 20) {
      await prisma.inventorySerial.updateMany({
        where: { id: { in: serials.map((serial) => serial.id) } },
        data: { status: SerialStatus.BOOKED },
      });
      await prisma.proformaInvoiceSerial.createMany({
        data: serials.map((serial) => ({
          piId: newPi.id,
          serialId: serial.id,
        })),
        skipDuplicates: true,
      });
      await prisma.inventoryTransaction.create({
        data: {
          transactionType: InventoryTransactionType.BOOK,
          companyId: ise.id,
          productId: moduleProduct.id,
          qty: 20,
          fromWarehouseId: warehouse.id,
          referenceType: "PROFORMA_INVOICE",
          referenceId: newPi.id,
          notes: `Booked for ${newPi.piNo}`,
          createdById: manager.id,
        },
      });
    }
  }

  if (!bookedPi) return;

  const piItem = await prisma.proformaInvoiceItem.findFirst({
    where: { piId: bookedPi.id, productId: moduleProduct.id },
  });
  if (!piItem) return;

  const dcNo = `${ise.code}-DC-${fy}-00001`;
  const existingDispatch = await prisma.dispatch.findFirst({ where: { dcNo } });
  if (existingDispatch) return;

  const bookedSerials = await prisma.proformaInvoiceSerial.findMany({
    where: { piId: bookedPi.id, serial: { status: SerialStatus.BOOKED } },
    include: { serial: true },
    take: 10,
  });

  const dispatch = await prisma.dispatch.create({
    data: {
      dcNo,
      companyId: ise.id,
      customerId: customer.id,
      proformaInvoiceId: bookedPi.id,
      warehouseId: warehouse.id,
      status: DispatchStatus.DISPATCHED,
      dispatchDate: piDate,
      vehicleNo: "MH-12-SEED-01",
      driverName: "Seed Driver",
      createdById: warehouseUser.id,
      dispatchedById: warehouseUser.id,
      dispatchedAt: new Date(),
      lines: {
        create: [
          {
            proformaInvoiceItemId: piItem.id,
            productId: moduleProduct.id,
            qty: bookedSerials.length || 10,
            serials: bookedSerials.length
              ? {
                  create: bookedSerials.map((entry) => ({ serialId: entry.serialId })),
                }
              : undefined,
          },
        ],
      },
    },
  });

  await prisma.documentSequence.upsert({
    where: {
      companyId_documentType_financialYear: {
        companyId: ise.id,
        documentType: "DISPATCH",
        financialYear: fy,
      },
    },
    create: {
      companyId: ise.id,
      documentType: "DISPATCH",
      financialYear: fy,
      lastSequence: 1,
    },
    update: { lastSequence: 1 },
  });

  const dispatchQty = bookedSerials.length || 10;
  if (bookedSerials.length) {
    await prisma.inventorySerial.updateMany({
      where: { id: { in: bookedSerials.map((entry) => entry.serialId) } },
      data: { status: SerialStatus.DISPATCHED },
    });
  }

  await prisma.inventoryTransaction.create({
    data: {
      transactionType: InventoryTransactionType.DISPATCH,
      companyId: ise.id,
      productId: moduleProduct.id,
      qty: dispatchQty,
      fromWarehouseId: warehouse.id,
      referenceType: "DISPATCH",
      referenceId: dispatch.id,
      notes: `Dispatched on ${dcNo}`,
      createdById: warehouseUser.id,
    },
  });

  await prisma.proformaInvoiceItem.update({
    where: { id: piItem.id },
    data: { dispatchedQty: dispatchQty },
  });

  await prisma.proformaInvoice.update({
    where: { id: bookedPi.id },
    data: { status: ProformaInvoiceStatus.PARTIALLY_DISPATCHED },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
