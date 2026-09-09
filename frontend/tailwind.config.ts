import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        storm: {
          950: "#07111f",
          900: "#0c1c30",
          800: "#102742",
          700: "#14304f",
          300: "#9eb6cf",
          200: "#bfd0df",
          100: "#dde7ef",
        },
        surge: {
          500: "#4fb6ff",
          400: "#6ac4ff",
          300: "#8cd2ff",
        },
        warning: "#ffb45c",
        danger: "#f36b6b",
        safe: "#54d399",
      },
      boxShadow: {
        glow: "0 20px 80px rgba(79, 182, 255, 0.18)",
      },
      backgroundImage: {
        "storm-fade":
          "radial-gradient(circle at top, rgba(79, 182, 255, 0.2), transparent 40%), radial-gradient(circle at bottom right, rgba(24, 94, 181, 0.22), transparent 35%)",
      },
      fontFamily: {
        body: ["Aptos", "\"Segoe UI Variable Text\"", "\"Trebuchet MS\"", "sans-serif"],
        display: ["Bahnschrift", "\"Aptos Display\"", "\"Segoe UI Semibold\"", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
