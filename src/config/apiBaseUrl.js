const fromEnv = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

const resolvedBaseUrl =
  fromEnv ||
  (import.meta.env.DEV
    ? "http://localhost:4000"
    : "https://posflyt-backend.onrender.com");

// 🔥 DEBUG LOG (THIS IS WHAT WE NEED)
console.log("🔥 API_BASE_URL RESOLVED:", resolvedBaseUrl);

export const API_BASE_URL = resolvedBaseUrl;
