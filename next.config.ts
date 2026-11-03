import type { NextConfig } from "next";

const pdfTraceAssets = [
  "./assets/branding/**",
  "./assets/fonts/**",
  "./assets/installation-timeline/**",
  "./node_modules/pdfkit/js/data/**",
];

/**
 * Routes that generate PDFs at runtime. Next 15.3 matches these keys with
 * picomatch (`contains: true`) against the normalized App Router path
 * (and `/app/api/...` traces). Dynamic `[id]` is escaped so it is not a
 * character class; `*` variants keep matching if the traced path differs.
 */
const pdfTraceRoutes = [
  "/api/quotations/[id]/pdf",
  "/api/proforma-invoices/[id]/pdf",
  "/api/dispatches/[id]/pdf",
  "/api/dispatches/[id]/courier-stickers",
  "/api/project-dispatches/[id]/pdf",
  "/api/project-proposals/[id]/pdf",
  "/api/letters/[id]/pdf",
  "/api/letters/[id]/print",
  "/api/letters/[id]/issue",
  "/api/letters",
  "/api/share/quotation",
  "/api/share/proforma-invoice",
  "/api/share/dispatch",
  "/api/share/project-proposal",
  "/api/reports/product-movement",
  "/api/reports/dispatch-profit",
  "/api/reports/dispatch",
  "/api/reports/sales-funnel",
  "/api/reports/executive-sales",
  "/api/reports/customer-sales-revenue",
  "/api/reports/collection",
  "/api/reports/booked-available",
  "/api/reports/executive-performance",
  "/api/reports/payment-followup",
  "/api/reports/reserved-qty",
  "/api/reports/sales-executive",
  "/api/reports/sales-performance",
];

function tracingKeysFor(route: string): string[] {
  const escaped = route.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  const starred = route.replace(/\[id\]/g, "*");
  return [...new Set([escaped, starred])];
}

/**
 * Baseline security headers. CSP is intentionally not set yet; see the
 * follow-up list in the commit/PR notes.
 *
 * X-Frame-Options is DENY globally. The PDF routes below are embedded in
 * same-origin <iframe> previews (letter-detail, document-generator wizard and
 * generation-detail), so they are overridden to SAMEORIGIN. Next applies every
 * matching header rule, and the later, more specific rule wins for the same key.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera stays allowed for the html5-qrcode scanner.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const sameOriginFramePaths = [
  "/api/letters/:id/pdf",
  "/api/document-generator/generations/:id/pdf",
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      ...sameOriginFramePaths.map((source) => ({
        source,
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      })),
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Keep pdfkit out of the webpack bundle so it is required from node_modules at
  // runtime. Bundling breaks its internal `__dirname + '/data/*.afm'` font-metric
  // reads (the constructor always loads Helvetica), which makes PDF generation
  // throw on the server and the download fail.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: Object.fromEntries(
    pdfTraceRoutes.flatMap(tracingKeysFor).map((key) => [key, pdfTraceAssets]),
  ),
};

export default nextConfig;
