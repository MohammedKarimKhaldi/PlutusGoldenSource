import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next intentionally rejects bare "*" here; "**.*" allows any dotted host
  // such as LAN IPv4 addresses and normal domain names during development.
  allowedDevOrigins: ["**.*"],
  reactStrictMode: true,
};

export default nextConfig;
