/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Ignore TypeScript errors during build (we have our own src folder)
  typescript: {
    ignoreBuildErrors: false,
  },

  // Environment variables that should be available on the client
  env: {
    NEXT_PUBLIC_APP_NAME: 'AgentQA',
    NEXT_PUBLIC_APP_VERSION: '1.0.0',
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ];
  },

  // Empty turbopack config to silence the warning
  turbopack: {},

  // Packages that should be bundled externally
  serverExternalPackages: ['playwright', 'playwright-core'],
};

module.exports = nextConfig;
