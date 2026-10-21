import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le service worker des notifications push : toujours relu, pour qu'une
  // nouvelle version s'installe sans attendre un cache.
  headers: () =>
    Promise.resolve([
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ]),
};

export default nextConfig;
