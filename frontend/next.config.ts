import type { NextConfig } from "next";

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_MAPBOX_TOKEN: mapboxToken,
  },
  reactStrictMode: true,
};

export default nextConfig;
