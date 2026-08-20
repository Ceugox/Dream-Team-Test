import type { NextConfig } from "next";

// A LiveURL temporária do provider não pode vazar via Referer nem ser cacheada;
// a página de conexão também não deve ser incorporável por terceiros.
const sensitiveHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER_STANDALONE === "true" ? "standalone" : undefined,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      { source: "/linkedin/:path*", headers: sensitiveHeaders },
      { source: "/api/linkedin/:path*", headers: sensitiveHeaders },
    ];
  },
};

export default nextConfig;
