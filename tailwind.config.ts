import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/renderer/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/renderer/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          burgundy: '#853A47',
          'burgundy-light': '#9C4857',
          'burgundy-dark': '#652A34',
          cream: '#F4F0E6',
          'cream-dark': '#E6DFC9',
          lavender: '#7A7085',
          'slate-dark': '#140F18',
          'card-dark': '#1F1825',
          'border-dark': '#382B3E',
        },
      },
    },
  },
  plugins: [],
};

export default config;
