import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        phuclong: {
          50: "#eef8f1",
          100: "#d8efdf",
          500: "#0f7a3b",
          600: "#0a6430",
          700: "#084f28",
        },
        workshop: "#f6f1e7",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(8, 79, 40, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
