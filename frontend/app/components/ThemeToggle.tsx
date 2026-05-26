'use client';

import { useTheme, BG_COLORS } from './ThemeProvider';

const BG_LABELS: Record<string, string> = {
  black: 'BLACK',
  white: 'WHITE',
};

const TEXT_COLORS: Record<string, string> = {
  black: '#ffffff',
  white: '#000000',
};

export function ThemeToggle() {
  const { bgLevel, cycleBg } = useTheme();

  return (
    <button
      onClick={cycleBg}
      className="fixed top-4 right-4 px-3 py-2 rounded-lg z-50 text-xs font-mono transition-all border border-white/20 shadow-sm hover:opacity-80"
      style={{
        background: BG_COLORS[bgLevel],
        color: TEXT_COLORS[bgLevel],
        borderColor: 'var(--input-border)',
      }}
      aria-label="Toggle color mode"
    >
      {BG_LABELS[bgLevel]}
    </button>
  );
}
