import { loadEnvConfig } from "@next/env";
import { resolve } from "path";
import type { NextConfig } from "next";

// Load env vars from the monorepo root (.env, .env.local, etc.)
loadEnvConfig(resolve(__dirname, ".."));

const nextConfig: NextConfig = {
  transpilePackages: ["@viberoute/shared"],
};

export default nextConfig;

