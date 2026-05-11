import type { NextConfig } from "next";

// Extra origins allowed in dev mode — read from env so no IPs appear in source.
// Set ALLOWED_DEV_ORIGINS="192.168.x.x,202.120.x.x" in .env
const extraDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
  : [];

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: extraDevOrigins,
  // Prevent stale Server Action IDs after redeployment.
  // /_next/static/ files are content-hashed so they're safe to cache long-term.
  // All HTML pages must not be cached so browsers always fetch the latest build.
  async headers() {
    return [
      {
        source: "/((?!_next/static/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
