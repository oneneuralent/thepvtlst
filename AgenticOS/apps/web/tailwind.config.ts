import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#070a0d",
        fog: "#f7f8fb",
        line: "rgba(45, 212, 191, 0.16)",
        brand: {
          300: "#99f6e4",
          400: "#5eead4",
          500: "#2dd4bf",
          600: "#0d9488",
          700: "#0f766e"
        },
        coral: "#2dd4bf",
        mint: "#5eead4",
        amber: "#14b8a6"
      },
      boxShadow: {
        glow: "0 24px 90px rgba(45, 212, 191, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
