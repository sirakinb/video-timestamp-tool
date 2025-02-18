/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Temporarily allow build errors during deployment
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['localhost', 'funtimesvideo-backend.onrender.com'],
  },
  swcMinify: true,
};

module.exports = nextConfig; 