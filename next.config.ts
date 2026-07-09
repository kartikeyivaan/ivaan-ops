import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // Ensure runtime PDF assets (branding logos + embedded fonts) and pdfkit's own
  // font-metric data files are traced into the serverless bundle for API routes
  // that generate PDFs.
  outputFileTracingIncludes: {
    "/api/**": [
      "./assets/branding/**",
      "./assets/fonts/**",
      "./assets/installation-timeline/**",
      "./node_modules/pdfkit/js/data/**",
    ],
  },
};

export default nextConfig;
