const isStaticExport = process.env.STATIC_EXPORT === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // [v4.9.11] Cloudtype 최적화: Vercel 밖의 컨테이너 환경에서는 standalone 빌드로 압축, CPU 부하 방지
  output: isStaticExport ? 'export' : 'standalone',
  // [v4.9.63] standalone 빌드 시 data/ 폴더(safe-freight.json 35MB)를 서버리스 함수 번들에 포함
  // ⚠️ Next.js 14에서는 반드시 experimental 블록 안에 위치해야 인식됨
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./data/**/*', './public/data/**/*'],
    },
  },
  images: {
    // Cloudtype의 한정된 CPU를 On-the-fly 이미지 리사이징으로 낭비하지 않도록 강제 비활성화
    unoptimized: true,
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