import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Dev only. Set DEV_LAN_ORIGIN in .env.local (e.g. 192.168.0.12, this PC's LAN address) so a
  // phone on the same Wi-Fi can open the dev server.
  allowedDevOrigins: ["127.0.0.1", "localhost", ...(process.env.DEV_LAN_ORIGIN ? [process.env.DEV_LAN_ORIGIN] : [])],
  // The site's real entry is the mobile app: the bare domain must open it, not a 404.
  async redirects() {
    return [{ source: "/", destination: "/mobile", permanent: false }];
  },
};

export default nextConfig;
