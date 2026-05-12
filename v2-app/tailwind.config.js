/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2e3f",
        ink2: "#3a4a5a",
        accent: "#2f6675",
        warm: "#e8b87a",
        muted: "#6b7a87",
        line: "#e3e8ec",
        bgalt: "#f6f8fa",
      },
      fontFamily: {
        sans: ["Commissioner", "system-ui", "sans-serif"],
        display: ["Lexend", "system-ui", "sans-serif"],
      },
      borderRadius: { md: "10px" },
      maxWidth: { content: "1320px" },
    },
  },
  plugins: [],
};
