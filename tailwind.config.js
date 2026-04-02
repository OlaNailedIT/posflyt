/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /** Brand: teal (POS / money / trust) — avoid blue/purple gradients */
        brand: {
          DEFAULT: "#0f766e",
          muted: "#115e59",
          light: "#14b8a6",
        },
      },
    },
  },
  plugins: [],
};
