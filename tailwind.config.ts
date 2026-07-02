import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

// Every token below resolves to a CSS variable holding space-separated R G B
// components (not a hex string) so Tailwind's `<alpha-value>` placeholder can
// inject opacity modifiers like `bg-primary/10` - see the `--background` etc.
// custom properties in app/globals.css for the actual light/dark values.
function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: ["class"],
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
        background: withOpacity("--color-background"),
        foreground: withOpacity("--color-foreground"),
        navy: {
          DEFAULT: withOpacity("--color-navy"),
          light: withOpacity("--color-navy-light"),
          dark: withOpacity("--color-navy-dark"),
        },
        primary: {
          DEFAULT: withOpacity("--color-primary"),
          foreground: withOpacity("--color-primary-foreground"),
        },
        accent: {
          DEFAULT: withOpacity("--color-accent"),
          foreground: withOpacity("--color-accent-foreground"),
        },
        gold: {
          DEFAULT: withOpacity("--color-gold"),
        },
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          raised: withOpacity("--color-surface-raised"),
          overlay: withOpacity("--color-surface-overlay"),
        },
        card: {
          DEFAULT: withOpacity("--color-card"),
          foreground: withOpacity("--color-card-foreground"),
        },
        border: withOpacity("--color-border"),
        input: withOpacity("--color-input"),
        muted: withOpacity("--color-muted"),
        ring: withOpacity("--color-ring"),
        destructive: {
          DEFAULT: withOpacity("--color-destructive"),
          foreground: withOpacity("--color-destructive-foreground"),
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
