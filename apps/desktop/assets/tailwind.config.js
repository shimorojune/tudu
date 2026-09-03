// Tailwind v3 fallback. On v4, use assets/theme.css instead and delete this.
const { fontFamily } = require("tailwindcss/defaultTheme");

module.exports = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Archivo", ...fontFamily.sans] },
      borderRadius: { sm: "0", md: "0", lg: "0", xl: "0" },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        ink: {
          100: "#f8f4f4", 200: "#eae7e7", 300: "#d7d3d3", 400: "#bab6b6", 500: "#9b9797",
          600: "#7d7979", 700: "#605d5d", 800: "#444141", 900: "#2d2b2b",
        },
        red: {
          100: "#fff2ef", 200: "#ffe0d9", 300: "#ffc4b8", 400: "#ff9783", 500: "#ff563c",
          600: "#dd2b0f", 700: "#ae1800", 800: "#7c1405", 900: "#4d170e",
        },
      },
    },
  },
};
