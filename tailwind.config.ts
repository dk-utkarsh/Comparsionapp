import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        mint: "#f0f6f4",
        teal: {
          DEFAULT: "#0d9488",
          dark: "#0f766e",
          light: "#99d5cf",
        },
        accent: "#3b82f6",
        success: "#059669",
        danger: "#dc2626",
        slate: {
          text: "#1e293b",
          muted: "#64748b",
          light: "#94a3b8",
        },
      },
    },
  },
  plugins: [],
};
export default config;
