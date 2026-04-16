/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_HUB_URL:
      process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.asteby.com',
  },
};

export default nextConfig;
