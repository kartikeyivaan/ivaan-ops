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
import { ISE_BANK_DETAILS } from "@/lib/proposal-pdf-content";

const prisma = new PrismaClient();

const DEFAULT_TERMS = [
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
    bankDetails: ISE_BANK_DETAILS,
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
