/** @type {import('tailwindcss').Config} */

const cssVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        background: cssVar('--c-bg'),
        surface: cssVar('--c-surface'),
        'surface-dim': cssVar('--c-surface-dim'),
        'surface-variant': cssVar('--c-surface-variant'),
        'on-background': cssVar('--c-on-bg'),
        'on-surface': cssVar('--c-on-surface'),
        'on-surface-variant': cssVar('--c-on-surface-variant'),
        primary: cssVar('--c-primary'),
        'primary-container': cssVar('--c-primary-container'),
        secondary: cssVar('--c-secondary'),
        'surface-tint': cssVar('--c-surface-tint'),
        outline: cssVar('--c-outline'),
        'outline-variant': cssVar('--c-outline-variant'),
        error: cssVar('--c-error'),
      },
      fontFamily: {
        body: ['var(--font-mono)'],
        label: ['var(--font-mono)'],
        mono: ['var(--font-mono)'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        sm: '2px',
        md: '4px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        glow: '0 0 15px rgb(var(--c-primary-container) / 0.15)',
        'glow-sm': '0 0 8px rgb(var(--c-primary-container) / 0.1)',
        'glow-lg': '0 0 25px rgb(var(--c-primary-container) / 0.2)',
        card: '0 2px 8px rgb(0 0 0 / 0.3)',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgb(var(--c-primary-container) / 0.1)' },
          '50%': { boxShadow: '0 0 20px rgb(var(--c-primary-container) / 0.25)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
