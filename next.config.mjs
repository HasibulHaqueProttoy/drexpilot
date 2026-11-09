/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  // In dev mode, Next.js dev server proxies API calls if running separately
  ...(process.env.NODE_ENV === 'development' && {
    // Note: output 'export' disables rewrites, so in dev mode we omit output export
  }),
};

export default nextConfig;
