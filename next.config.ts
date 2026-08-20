import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_STANDALONE === "true" ? "standalone" : undefined,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
