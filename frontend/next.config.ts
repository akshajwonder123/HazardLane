import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  reactStrictMode: true,
};

export default nextConfig;
