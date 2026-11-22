import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the server bundle small and let Node resolve the Postgres driver natively.
  serverExternalPackages: ["postgres", "bcryptjs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/volunteer" }] },
    ];
  },
};

export default nextConfig;
