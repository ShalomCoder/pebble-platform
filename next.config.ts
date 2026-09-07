import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "pg", "drizzle-orm"],
};

export default nextConfig;