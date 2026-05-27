/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        nunito: ['Nunito', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#003366',
          secondary: '#00AEEF',
        },
      },
      backgroundImage: {
        grid: "linear-gradient(#efefef 1px, transparent 1px), linear-gradient(90deg, #efefef 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: '40px 40px',
      },
    },
  },
  plugins: [],
};
