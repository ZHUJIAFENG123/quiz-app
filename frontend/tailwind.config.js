/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e8f0fe',
          100: '#c6dafc',
          200: '#a0c0fa',
          300: '#7aa5f8',
          400: '#5e90f6',
          500: '#427bf4',
          600: '#1a56db',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#1a2d6d',
        }
      }
    },
  },
  plugins: [],
}
