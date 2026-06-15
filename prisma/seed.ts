import bcrypt from "bcryptjs";
import { CapacityUnit, PricingType, PrismaClient } from "@prisma/client";
import { ROLES } from "../src/lib/rbac";
import { PRODUCT_CATEGORY_NAMES } from "../src/lib/products";

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

  const ise = await prisma.company.upsert({
    where: { code: "ISE" },
    update: {},
    create: {
      name: "Ivaan Solar Energy",
      code: "ISE",
      bankDetails: "ISE bank details placeholder",
      termsAndConditions: "ISE terms and conditions placeholder",
    },
  });

  const pcmv = await prisma.company.upsert({
    where: { code: "PCMV" },
    update: {},
    create: {
      name: "PCM Ventures",
      code: "PCMV",
      bankDetails: "PCMV bank details placeholder",
      termsAndConditions: "PCMV terms and conditions placeholder",
    },
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

  const admin = await prisma.user.upsert({
    where: { email: "admin@ivaansolar.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@ivaansolar.com",
      mobile: "9999999999",
      passwordHash,
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
    update: {},
    create: {
      name: "Sales Manager",
      email: "manager@ivaansolar.com",
      passwordHash: salesManagerPassword,
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
    update: {},
    create: {
      name: "Sales Executive",
      email: "sales@ivaansolar.com",
      passwordHash: salesExecPassword,
      roles: {
        create: [{ roleId: roleMap[ROLES.SALES_EXECUTIVE] }],
      },
      companies: {
        create: [{ companyId: ise.id }],
      },
    },
  });

  const warehousePassword = await bcrypt.hash("Warehouse@123", 12);
  await prisma.user.upsert({
    where: { email: "warehouse@ivaansolar.com" },
    update: {},
    create: {
      name: "Warehouse Manager",
      email: "warehouse@ivaansolar.com",
      passwordHash: warehousePassword,
      roles: {
        create: [{ roleId: roleMap[ROLES.WAREHOUSE] }],
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
      companyId: ise.id,
      companyCode: ise.code,
      customerCode: "ISE-CUST-00001",
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
      companyId: ise.id,
      companyCode: ise.code,
      customerCode: "ISE-CUST-00002",
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
      companyId: pcmv.id,
      companyCode: pcmv.code,
      customerCode: "PCMV-CUST-00001",
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
      where: {
        companyId_gstNumber: {
          companyId: customer.companyId,
          gstNumber: customer.gstNumber,
        },
      },
      update: {},
      create: {
        companyId: customer.companyId,
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
      isePrice: { landingCost: 18, standardPrice: 22, minimumPrice: 20 },
      pcmvPrice: { landingCost: 18.5, standardPrice: 22.5, minimumPrice: 20.5 },
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
      isePrice: { landingCost: 45000, standardPrice: 52000, minimumPrice: 48000 },
      pcmvPrice: { landingCost: 45500, standardPrice: 52500, minimumPrice: 48500 },
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
      isePrice: { landingCost: 45, standardPrice: 65, minimumPrice: 55 },
      pcmvPrice: { landingCost: 46, standardPrice: 66, minimumPrice: 56 },
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

    const pricePairs = [
      { companyId: ise.id, price: item.isePrice },
      { companyId: pcmv.id, price: item.pcmvPrice },
    ];

    for (const pair of pricePairs) {
      const existingPrice = await prisma.productPrice.findFirst({
        where: {
          productId: product.id,
          companyId: pair.companyId,
          effectiveTo: null,
        },
      });

      if (!existingPrice) {
        await prisma.productPrice.create({
          data: {
            productId: product.id,
            companyId: pair.companyId,
            landingCost: pair.price.landingCost,
            standardPrice: pair.price.standardPrice,
            minimumPrice: pair.price.minimumPrice,
            effectiveFrom: new Date(),
          },
        });
      }
    }
  }

  console.log("Seed completed.");
  console.log("Admin login: admin@ivaansolar.com / Admin@123");
  console.log("Sales Executive login: sales@ivaansolar.com / Sales@123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
