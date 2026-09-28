/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'timetracktoday.vercel.app',
          },
        ],
        destination: 'https://time-track-app-1qrp.onrender.com/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
