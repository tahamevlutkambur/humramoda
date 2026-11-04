import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "@prisma/client"],
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/koleksiyonlar/:slug",
        destination: "/koleksiyon/:slug",
        permanent: true,
      },
      {
        source: "/koleksiyonlar",
        destination: "/urunler",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/media/:path*",
      },
    ];
  },
};

export default nextConfig;
