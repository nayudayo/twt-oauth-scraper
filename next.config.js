/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // Ensure CSS modules are properly handled
  webpack(config) {
    return config;
  }
}

module.exports = nextConfig 