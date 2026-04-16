/** @type {import('next').NextConfig} */
import { withPayload } from "@payloadcms/next/withPayload";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    const nodeBackend =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:6050";
    return [
      {
        source: "/api/visitors/:path*",
        destination: `${nodeBackend}/visitors/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  webpack: (config, _context) => {
    config.resolve.fallback = { fs: false };
    config.resolve.alias["jotai"] = resolve(__dirname, "node_modules/jotai");
    config.resolve.alias["@coral-xyz/anchor$"] = resolve(__dirname, "node_modules/@coral-xyz/anchor/dist/cjs/index.js");

    // Alias for problematic anchor imports
    config.resolve.alias["@coral-xyz/anchor/dist/cjs/utils/bytes"] = resolve(
      __dirname,
      "node_modules/@coral-xyz/anchor/dist/esm/utils/bytes",
    );

    // Exclude undici from webpack processing to avoid build errors
    config.externals = config.externals || [];
    config.externals.push("undici");

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );

    return config;
  },
};

export default withPayload(nextConfig);
