import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        paper: "#f4efe7",
        sea: "#0e7490",
        sand: "#d6b98b",
        ember: "#d97706",
        moss: "#4d7c0f",
      },
      boxShadow: {
        panel: "0 20px 50px rgba(23, 23, 23, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;

