import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Increase body size limit for large video uploads (5GB)
    serverActions: {
      bodySizeLimit: '5gb',
    },
  },
};

export default nextConfig;
