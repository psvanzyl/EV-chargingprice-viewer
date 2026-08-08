import type { NextConfig } from "next";

// Basemap (CartoDB Positron via MapLibre) hosts used by the client.
const MAP_TILE_HOSTS = "https://basemaps.cartocdn.com https://*.basemaps.cartocdn.com";

const nextConfig: NextConfig = {
  compress: true,

  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-XSS-Protection", value: "1; mode=block" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    const csp = (frameAncestors: string) =>
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: https://logo.clearbit.com ${MAP_TILE_HOSTS}`,
        "font-src 'self' data:",
        `connect-src 'self' https://va.vercel-scripts.com ${MAP_TILE_HOSTS}`,
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        `frame-ancestors ${frameAncestors}`,
      ].join("; ");

    return [
      {
        source: "/embed",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: csp("*") },
        ],
      },
      {
        source: "/((?!embed).*)",
        headers: [
          ...securityHeaders,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp("'none'") },
        ],
      },
      {
        // Crop-out + national GeoJSON: cache 1 hour.
        source: "/data/:path*.geojson",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
          { key: "Content-Type", value: "application/geo+json" },
        ],
      },
      {
        // Per-gemeente detail bundles: cache 1 hour + SWR.
        source: "/data/:path*.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/municipalities.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
