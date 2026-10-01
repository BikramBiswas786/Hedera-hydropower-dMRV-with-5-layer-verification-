import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
    // `next lint` checks app/ and components/ by default; the engine, server code and scripts need it too.
    dirs: ["app", "components", "hooks", "services", "scripts", "utils", "types"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    if (dev) {
      // Follow workspace symlinks, but do not snapshot node_modules. Clearing managedPaths makes
      // webpack hash every installed package and the dev server runs out of memory on a laptop.
      config.watchOptions = {
        followSymlinks: true,
        ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**"],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
