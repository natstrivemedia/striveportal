import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM binary + filesystem access; it must stay outside the
  // bundler and run on the Node runtime. Same for sharp (native bindings).
  serverExternalPackages: ["@electric-sql/pglite", "sharp"],

  async headers() {
    return [
      {
        // Client portals are secret-link addressable. Keep them out of search
        // engines, and out of Referer headers pointed at third parties.
        source: "/p/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
