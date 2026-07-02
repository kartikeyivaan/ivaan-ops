/**
 * Safe, idempotent production updater for company document details ONLY.
 *
 * Unlike `prisma db seed`, this script does NOT create demo users, customers,
 * products, quotations, PIs, or dispatches. It only fills the profile fields
 * (address / contact / GST / tagline / bank / terms) on the ISE and PCMV
 * company rows, so it is safe to run against a production database.
 *
 * Usage (PowerShell), pointing at the target DB:
 *   $env:DATABASE_URL = "<connection-string>"
 *   npx tsx scripts/update-company-profiles.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TERMS = [
  "Payment: 100% advance before dispatch.",
  "Taxes: As per Govt. norms.",
  "Transportation: Extra at actual; unloading in client scope.",
  "Warranty: As per OEM terms.",
  "PO Cancellation Charges: 5% of the total value of the PI/Invoice.",
].join("\n");

const PROFILES = [
  {
    code: "ISE",
    name: "Ivaan Solar Energy",
    address:
      "Waaree Solar Center, Opp. K. U. Kolhe School,\nOld Nashirabad Road, Near Kalika Mata Mandir Chowk",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 8888 555 832",
    email: "connect@ivaansolar.com",
    gstNumber: "27AAJFI3520N1Z5",
    tagline: "Authorised Waaree Franchise",
    bankDetails:
      "Bank: State Bank of India\nA/c No: 41649096711   IFSC: SBIN0018300\nBranch: Kalika Mandir, Jalgaon",
    termsAndConditions: DEFAULT_TERMS,
  },
  {
    code: "PCMV",
    name: "PCM Ventures",
    address:
      "Opp. K. U. Kolhe School, Old Nashirabad Road,\nNear Kalika Mata Mandir Chowk",
    city: "Jalgaon",
    state: "Maharashtra",
    pincode: "425001",
    phone: "+91 7385 1589 47",
    email: "pcmventures@outlook.com",
    gstNumber: "27ABHFP7656F1ZU",
    tagline: null,
    bankDetails:
      "Bank: State Bank of India\nA/c No: 44431999106   IFSC: SBIN0018300\nUPI: pcmventures@sbi\nBranch: Kalika Mandir, Jalgaon",
    termsAndConditions: DEFAULT_TERMS,
  },
];

async function main() {
  for (const { code, name, ...fields } of PROFILES) {
    const existing = await prisma.company.findUnique({ where: { code } });
    if (existing) {
      await prisma.company.update({ where: { code }, data: fields });
      console.log(`Updated company ${code} (${name}).`);
    } else {
      await prisma.company.create({ data: { code, name, ...fields } });
      console.log(`Created company ${code} (${name}).`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
