/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
    // Tailles générées par le serveur Next.js pour les thumbnails de la médiathèque
    deviceSizes: [640, 1080, 1920],
    imageSizes: [128, 256, 400],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 jours
  },
};

export default nextConfig;
  
