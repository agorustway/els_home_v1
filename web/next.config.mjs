const isStaticExport = process.env.STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStaticExport ? 'export' : undefined,
  images: {
    unoptimized: isStaticExport ? true : false,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '**' },
      { protocol: 'https', hostname: 'elssolution.synology.me', pathname: '**' },
    ],
  },
  async redirects() {
    if (isStaticExport) return [];
    return [
      { source: '/employees/webzine', destination: '/webzine', permanent: true },
      { source: '/employees/webzine/:path*', destination: '/webzine/:path*', permanent: true },
    ];
  },
  async headers() {
    if (isStaticExport) return [];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        jsdom: 'commonjs jsdom',
        canvas: 'commonjs canvas',
      });
    }
    return config;
  },
};

export default nextConfig;