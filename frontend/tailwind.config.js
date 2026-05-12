/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#c0392b',
          darkred: '#922b21',
          charcoal: '#1a1a1a',
          surface: '#242424',
          border: '#3a3a3a',
        },
      },
    },
  },
  plugins: [],
};
