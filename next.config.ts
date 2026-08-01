import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: '../../out', // Outputs compiled static files to /out at root
  images: {
    unoptimized: true, // Required for static exports
  },
};

export default nextConfig;
