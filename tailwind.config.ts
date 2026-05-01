import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0',
        foreground: '#ffffff',
        primary: '#0097b2',
        secondary: '#226683',
        accent: '#00e5ff',
        muted: '#64748b',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        success: '#10b981',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        keyframes: {
          'fade-in': {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' },
          },
          'slide-up': {
            '0%': { transform: 'translateY(100%)' },
            '100%': { transform: 'translateY(0%)' },
          },
          'heartbeat-pulse': {
            '0%': { transform: 'scale(1)', opacity: '1' },
            '50%': { transform: 'scale(1.03)', opacity: '0.85' },
            '100%': { transform: 'scale(1)', opacity: '1' },
          },
          'heartbeat-pulse-infinite': {
            '0%': { transform: 'scale(1)', opacity: '1' },
            '50%': { transform: 'scale(1.03)', opacity: '0.85' },
            '100%': { transform: 'scale(1)', opacity: '1' },
          },
        },
      },
    },
    keyframes: {
      speaking: {
        '0%': { height: '20%' },
        '25%': { height: '60%' },
        '50%': { height: '40%' },
        '75%': { height: '80%' },
        '100%': { height: '30%' },
      },
      idle: {
        '0%, 100%': { height: '30%' },
        '50%': { height: '40%' },
      },
    },
    animation: {
      'speaking': 'speaking 0.6s ease-in-out infinite',
      'idle': 'idle 2s ease-in-out infinite',
    },
  },
  plugins: [],
};

export default config;
