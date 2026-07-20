import type { Config } from "tailwindcss";

// Design tokens from docs/01_PRODUCT_SPEC.md §5 — "signal desk".
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0E1116",
        surface: "#161B22",
        hairline: "#262D37",
        text: "#E6E9EE",
        muted: "#8A93A2",
        edgePos: "#3FB68B",
        edgeNeg: "#D26A5C",
        accent: "#7AA2F7",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        table: "13px",
        body: "15px",
      },
    },
  },
  plugins: [],
};

export default config;
