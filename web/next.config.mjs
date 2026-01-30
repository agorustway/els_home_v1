/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/employees/webzine', destination: '/webzine', permanent: true },
      { source: '/employees/webzine/:path*', destination: '/webzine/:path*', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'elssolution.synology.me',
        pathname: '**',
      },
    ],
  },
};

export default nextConfig;