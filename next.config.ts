import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Ensure runtime PDF assets (branding logos + embedded fonts) are traced into
  // the serverless bundle for API routes that generate PDFs.
  outputFileTracingIncludes: {
    "/api/**": ["./assets/branding/**", "./assets/fonts/**"],
  },
};

export default nextConfig;
