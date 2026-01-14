/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed output: "export" because it's incompatible with dynamic routes
  // If you need static export, you'll need to handle dynamic routes differently
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
};

module.exports = nextConfig;
