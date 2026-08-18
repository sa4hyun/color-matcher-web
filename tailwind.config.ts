import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg0: "#0B0F1A",
        bg1: "#141B2E",
        glass: "rgba(255,255,255,0.06)",
        glassBorder: "rgba(255,255,255,0.12)",
        accentCyan: "#22D3EE",
        accentViolet: "#A78BFA",
        danger: "#F87171",
        ledRed: "#EF4444",
        ledGreen: "#22C55E",
        ledBlue: "#3B82F6",
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(34, 211, 238, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
