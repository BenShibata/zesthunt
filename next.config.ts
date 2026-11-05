import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    // A stray lockfile in a parent folder would otherwise be picked as the workspace root.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const dev = process.env.NODE_ENV !== "production";
    // Everything is same-origin: fonts are self-hosted by next/font, photos come through
    // /api/photo, and there are no analytics, pixels or third-party scripts at all.
    const csp = [
      "default-src 'self'",
      // Next.js inlines its bootstrap scripts; dev also needs eval for fast refresh.
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${dev ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(dev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), payment=(), usb=(), browsing-topics=(), microphone=(self), geolocation=(self), accelerometer=(self), gyroscope=(self)",
          },
        ],
      },
      // Not /api/photo: it sets its own short private browser cache.
      {
        source: "/api/(picks|party|health)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/mcp",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  }
};

export default nextConfig;
