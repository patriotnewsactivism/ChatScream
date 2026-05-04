import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './*.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea6c10',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        dark: {
          50:  '#f8f8f8',
          100: '#e8e8e8',
          200: '#c8c8c8',
          300: '#a0a0a0',
          400: '#707070',
          500: '#505050',
          600: '#363636',
          700: '#282828',
          800: '#1a1a1a',
          900: '#0f0f0f',
        },
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 0 12px 3px rgba(249,115,22,0.4)' },
          '50%':       { boxShadow: '0 0 24px 6px rgba(249,115,22,0.7)' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        scream: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '25%':      { transform: 'scale(1.05) rotate(-1deg)' },
          '75%':      { transform: 'scale(1.05) rotate(1deg)' },
        },
      },
      animation: {
        glow:         'glow 2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
        scream:       'scream 0.3s ease-in-out',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};

export default config;
