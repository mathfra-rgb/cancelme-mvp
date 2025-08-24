/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["picsum.photos"],
  },
  eslint: {
    // ⚠️ Ignore les erreurs ESLint pendant le build (elles resteront visibles en local)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ⚠️ Ignore les erreurs TypeScript pendant le build (utile tant qu'on peaufine les types)
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
