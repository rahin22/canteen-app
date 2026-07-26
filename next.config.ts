import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Photo uploads go through a server action. Phone cameras produce large
      // files; the client downscales first, but leave headroom for originals.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
