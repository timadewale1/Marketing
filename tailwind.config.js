/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Define our primary purple color palette
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        // Define our gold color palette
        gold: {
          50: '#fff9eb',
          100: '#ffefc2',
          200: '#ffe099',
          300: '#ffd166',
          400: '#ffbf33',
          500: '#ffaa00',
          600: '#cc8800',
          700: '#996600',
          800: '#664400',
          900: '#332200',
          950: '#1a1100',
        },
      },
    },
  },
  plugins: [],
}
