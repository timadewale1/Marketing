import type { NextConfig } from "next";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname), // forces Next.js to use this folder as root
};

export default nextConfig;
