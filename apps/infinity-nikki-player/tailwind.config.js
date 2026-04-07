/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#F7C0C1',
        secondary: '#F5B8C0',
      },
    },
  },
  plugins: [],
}
