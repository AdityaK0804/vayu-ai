/** @type {import('next').NextConfig} */
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

};
export default nextConfig;
