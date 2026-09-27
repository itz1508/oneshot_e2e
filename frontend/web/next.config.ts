import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "export",
  distDir: "dist",
  images: {
    unoptimized: true,
  },
  experimental: {
    webpackBuildWorker: false,
    parallelServerBuildTraces: false,
  },
};

export default nextConfig;
