import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        heading: ["var(--font-heading)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
      colors: {
        background: "#EEF2F9",
        foreground: "#0F1E3D",
        navy: {
          DEFAULT: "#0A1633",
          light: "#1B57B8",
          dark: "#060E22",
        },
        primary: {
          DEFAULT: "#1B57B8",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#2E6BE6",
          foreground: "#FFFFFF",
        },
        gold: {
          DEFAULT: "#C99A2E",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          raised: "#F7F9FD",
          overlay: "#EAF1FF",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#0F1E3D",
        },
        border: "#E2E7F0",
        input: "#E2E7F0",
        muted: "#5A6B87",
        ring: "#2E6BE6",
        destructive: {
          DEFAULT: "#C43D3D",
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        lg: "14px",
        md: "10px",
        sm: "8px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
