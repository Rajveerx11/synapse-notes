import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pg"],
  turbopack: {},
};

export default nextConfig;
