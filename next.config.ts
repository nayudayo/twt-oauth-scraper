import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: [
      'pbs.twimg.com',  // Twitter profile images
      'abs.twimg.com',  // Twitter media
      'ton.twimg.com'   // Twitter media
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
        pathname: '/profile_images/**',
      },
      {
        protocol: 'https',
        hostname: 'abs.twimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ton.twimg.com',
        pathname: '/**',
      }
    ]
  },
  reactStrictMode: true,
  swcMinify: true,
  optimizeFonts: true,
  webpack(config) {
    return config;
  }
};

export default nextConfig;
