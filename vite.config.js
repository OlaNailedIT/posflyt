import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || "https://posflyt-backend.onrender.com";
  let apiOriginPattern = null;
  try {
    apiOriginPattern = new RegExp(`^${escapeRegExp(new URL(apiUrl).origin)}/`);
  } catch {
    apiOriginPattern = null;
  }

  const runtimeCaching = [
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api"),
      handler: "NetworkOnly",
    },
  ];

  if (apiOriginPattern) {
    runtimeCaching.push({
      urlPattern: apiOriginPattern,
      handler: "NetworkOnly",
    });
  }

  return {
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        strategies: "generateSW",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "POSflyt",
          short_name: "POSflyt",
          theme_color: "#0d9488",
          background_color: "#0c0a09",
          display: "standalone",
          start_url: "/",
          icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
        },
        devOptions: {
          enabled: false,
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,svg,png,webp,woff2,woff,webmanifest}"],
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: true,
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching,
        },
      }),
    ],
  };
});
