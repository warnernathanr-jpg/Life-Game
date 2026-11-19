import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old addresses from before the bottom navigation.
  async redirects() {
    return [
      { source: "/today", destination: "/tasks", permanent: false },
      { source: "/coins", destination: "/stats", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
