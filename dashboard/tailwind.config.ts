import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            // Conservative palette — avoid the AI-slop gradient look (memory.md
            // notes from `frontend-design` skill).
            colors: {
                ink: { DEFAULT: "#0a0a0a", soft: "#1c1c1c" },
                paper: { DEFAULT: "#fafafa", soft: "#f0f0f0" },
                border: { DEFAULT: "#e0e0e0", strong: "#bdbdbd" },
                signal: { DEFAULT: "#0066ff", muted: "#7aa7ff" },
            },
            fontFamily: {
                sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
                mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
            },
        },
    },
    plugins: [],
};

export default config;
