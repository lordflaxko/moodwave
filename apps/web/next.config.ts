import type { NextConfig } from "next";

/**
 * All `/api/*` requests are proxied to the FastAPI service. The browser only ever talks
 * to this origin, so session cookies stay first-party and no API secret reaches the client.
 */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "*.spotifycdn.com" },
      // Demo catalog artwork (fetched once by apps/api/scripts/fetch_artwork.py)
      { protocol: "https", hostname: "*.dzcdn.net" },
      { protocol: "https", hostname: "*.mzstatic.com" },
    ],
  },
  experimental: {
    // AI generation can take a while; don't cut the proxied request short.
    proxyTimeout: 120_000,
  },
  poweredByHeader: false,
  output: "standalone",
};

export default nextConfig;
