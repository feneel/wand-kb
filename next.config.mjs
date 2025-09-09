// next.config.mjs
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,

  // Helps bundle server-only deps like @google-cloud/firestore
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/firestore'],
    // (optional) If you use Server Actions and big uploads:
    // serverActions: { bodySizeLimit: '2mb' },
  },

  // (optional) don’t fail the build on lint/type warnings during the challenge
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // (optional) avoid polyfill warnings on client
  webpack: (cfg, { isServer }) => {
    if (!isServer) {
      cfg.resolve.fallback = { fs: false, path: false, os: false, crypto: false, stream: false };
    }
    return cfg;
  },
};

export default config;
