import type { NextConfig } from "next";
import path from "path";

// Polling does not use inotify. A default Linux watcher limit otherwise kills `next dev`.
process.env.WATCHPACK_POLLING ??= "1000";
process.env.CHOKIDAR_USEPOLLING ??= "1";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
      // Poll, and do not walk node_modules. Native watchers run out on a default Linux limit.
      config.watchOptions = {
        followSymlinks: true,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /(?:^|[/\\])(\.git|node_modules|\.next|\.yarn)([/\\]|$)/,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
