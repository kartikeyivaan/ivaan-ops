import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateCourierStickerPdf } from "@/lib/courier-sticker-pdf";

async function main() {
  const pdf = await generateCourierStickerPdf({
    dcNo: "ISE-DC-26-27-00062",
    invoiceNumber: null,
    boxCount: 10,
    customer: {
      customerName: "Patil Enterprises",
      contactPersonName: "Rahul Patil",
      address: "12, Shivaji Nagar\nNear Bus Stand",
      city: "Jalgaon",
      state: "Maharashtra",
      pinCode: "425001",
      mobile: "9876543210",
    },
    company: {
      name: "Ivaan Solar Energy",
      code: "ISE",
      address: "Opp. K. U. Kolhe School, Old Nashirabad Road",
      city: "Jalgaon",
      state: "Maharashtra",
      pincode: "425001",
      phone: "+91 8888 555 832",
      email: "connect@ivaansolar.com",
      gstNumber: "27AAJFI3520N1Z5",
    },
  });

  const outDir = path.join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "courier-stickers-demo-10boxes.pdf");
  const fallbacks = [
    outPath,
    path.join(outDir, "courier-stickers-demo-10boxes-v2.pdf"),
    path.join(outDir, "courier-stickers-demo-10boxes-v3.pdf"),
    path.join(outDir, "courier-stickers-demo-10boxes-v4.pdf"),
    path.join(outDir, "courier-stickers-demo-10boxes-v5.pdf"),
    path.join(outDir, "courier-stickers-demo-10boxes-v6.pdf"),
    path.join(outDir, "courier-stickers-demo-10boxes-v7.pdf"),
  ];
  for (const candidate of fallbacks) {
    try {
      writeFileSync(candidate, pdf);
      console.log(`Wrote ${candidate} (${pdf.length} bytes)`);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw error;
    }
  }
  throw new Error("Unable to write demo PDF; close open copies and retry.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
