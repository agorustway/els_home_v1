/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '**',
      },
    ],
  },
  // Next.js 16의 새로운 proxy 기능을 활성화합니다.
  experimental: {
    proxy: true,
  },
};

export default nextConfig;