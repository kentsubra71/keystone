import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "surface-card": "var(--surface-card)",
        "surface-drawer": "var(--surface-drawer)",
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #6366f1, #8b5cf6)",
        "gradient-brand-hover": "linear-gradient(135deg, #4f46e5, #7c3aed)",
        "gradient-sidebar": "linear-gradient(180deg, var(--sidebar-from), var(--sidebar-to))",
        "gradient-mesh": "radial-gradient(at 27% 37%, #6366f1 0, transparent 50%), radial-gradient(at 97% 21%, #8b5cf6 0, transparent 50%), radial-gradient(at 52% 99%, #3b82f6 0, transparent 50%), radial-gradient(at 10% 29%, #a78bfa 0, transparent 50%)",
      },
      boxShadow: {
        "glow-brand": "0 0 20px rgba(99, 102, 241, 0.15)",
        "glow-brand-lg": "0 0 40px rgba(99, 102, 241, 0.2)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
