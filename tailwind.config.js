/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every color resolves through a CSS variable so switching themes is a
      // single attribute change on <html> — no class swapping, no rebuild.
      colors: {
        ground: "rgb(var(--ground) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-alt": "rgb(var(--surface-alt) / <alpha-value>)",
        "surface-raised": "rgb(var(--surface-raised) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)",
        "line-soft": "rgb(var(--border-soft) / <alpha-value>)",
        content: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        faint: "rgb(var(--text-faint) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-text) / <alpha-value>)",
        modified: "rgb(var(--st-modified) / <alpha-value>)",
        added: "rgb(var(--st-added) / <alpha-value>)",
        deleted: "rgb(var(--st-deleted) / <alpha-value>)",
      },
      // Font families resolve through variables so a pairing switch is one
      // property write, exactly like a palette switch.
      fontFamily: {
        sans: "var(--font-ui)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        card: "8px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },

        /* Onboarding: content enters from below as a step advances. */
        "rise-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        /* Leaving a step in the forward direction. */
        "rise-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-14px)" },
        },
        /* The logo mark on the welcome screen. */
        "logo-in": {
          "0%": { opacity: "0", transform: "scale(.86) rotate(-8deg)" },
          "60%": { opacity: "1", transform: "scale(1.04) rotate(2deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0)" },
        },
        /* Success checkmark on the final step. */
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(.5)" },
          "70%": { opacity: "1", transform: "scale(1.12)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        /* Slow ambient drift behind the onboarding screens. */
        drift: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(3%, -2%) scale(1.06)" },
        },
        /* Progress bar filling as steps complete. */
        "bar-grow": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in .16s ease-out",
        "scale-in": "scale-in .16s ease-out",
        spin: "spin .7s linear infinite",
        "rise-in": "rise-in .42s cubic-bezier(.16,1,.3,1) both",
        "rise-out": "rise-out .2s ease-in both",
        "logo-in": "logo-in .7s cubic-bezier(.16,1,.3,1) both",
        "pop-in": "pop-in .5s cubic-bezier(.16,1,.3,1) both",
        drift: "drift 18s ease-in-out infinite",
        "bar-grow": "bar-grow .5s cubic-bezier(.16,1,.3,1) both",
      },
    },
  },
  plugins: [],
};
