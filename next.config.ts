import type { NextConfig } from "next";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname), // forces Next.js to use this folder as root
  images: {
    domains: ["firebasestorage.googleapis.com", "i.ytimg.com", "img.youtube.com"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/vtpass',
        destination: '/bills',
        permanent: true,
      },
      {
        source: '/vtpass/:path*',
        destination: '/bills/:path*',
        permanent: true,
      },
    ]
  }
};

export default nextConfig;
