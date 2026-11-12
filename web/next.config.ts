import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/loan/:id", destination: "/desk/loan/:id", permanent: false },
      { source: "/memo", destination: "/desk/memo", permanent: false },
      { source: "/log", destination: "/desk/log", permanent: false },
    ];
  },
};

export default nextConfig;
