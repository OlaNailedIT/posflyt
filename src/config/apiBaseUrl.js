/**
 * Backend API origin (no trailing slash).
 * - Prefer `VITE_API_URL`; `VITE_API_BASE_URL` is accepted for legacy `.env` files.
 * - Local `vite` dev defaults to localhost:4000 so login/register hit your local API without extra env.
 */
const fromEnv = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

export const API_BASE_URL =
  fromEnv ||
  (import.meta.env.DEV ? "http://localhost:4000" : "https://posflyt-backend.onrender.com");
