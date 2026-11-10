import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/renderer/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/renderer/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Semantic Design System Tokens (KEY-296 / D1) */
        canvas: 'var(--color-canvas-val)',
        surface: 'var(--color-surface-val)',
        'surface-raised': 'var(--color-surface-raised-val)',
        border: 'var(--color-border-val)',
        text: 'var(--color-text-val)',
        'text-muted': 'var(--color-text-muted-val)',
        primary: 'var(--color-primary-val)',
        'primary-contrast': 'var(--color-primary-contrast-val)',
        accent: 'var(--color-accent-val)',
        success: 'var(--color-success-val)',
        warning: 'var(--color-warning-val)',
        danger: 'var(--color-danger-val)',
        focus: 'var(--color-focus-val)',

        /* Backwards-compatible aliases */
        sidebar: 'var(--bg-sidebar)',
        subtle: 'var(--border-subtle)',
        main: 'var(--text-main)',
        muted: 'var(--text-muted)',
      },
    },
  },
  plugins: [],
};

export default config;
