/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          dark: '#0a2540',
          mid: '#1e40af',
          light: '#06b6d4',
        },
      },
      fontFamily: {
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        wave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'wave': 'wave 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
