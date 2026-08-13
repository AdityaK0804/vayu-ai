/** @type {import('next').NextConfig} */
const LIVE_API = process.env.LIVE_API_PROXY || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,

  experimental: {
    /**
     * Barrel-file tree shaking.
     *
     * These are all barrel modules: importing one symbol makes webpack walk the
     * whole package. Pre-bundling them is the biggest available win on dev
     * compile time now that ~50 chart-registry files sit in the tree alongside
     * deck.gl and maplibre.
     */
    optimizePackageImports: [
      "@visx/shape",
      "@visx/scale",
      "@visx/gradient",
      "@visx/pattern",
      "@visx/grid",
      "@visx/event",
      "@visx/responsive",
      "motion",
      "lucide-react",
      "@tanstack/react-query",
      "d3-array",
    ],
  },

  /**
   * Proxy FastAPI live/agent routes so the browser stays same-origin
   * (avoids CORS in local demo). Production can set LIVE_API_PROXY.
   */
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${LIVE_API}/:path*`,
      },
    ];
  },
};
export default nextConfig;
