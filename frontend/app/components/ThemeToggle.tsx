'use client';

import { useTheme, BG_COLORS } from './ThemeProvider';

const BG_LABELS: Record<string, string> = {
  grey10: 'BG 10%',
  grey40: 'BG 40%',
  grey60: 'BG 60%',
  grey90: 'BG 90%',
};

const TEXT_COLORS: Record<string, string> = {
  grey10: '#d0d0d0',
  grey40: '#d0d0d0',
  grey60: '#ffffff',
  grey90: '#1a1a1a',
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
      }}
      aria-label="Cycle background"
    >
      {BG_LABELS[bgLevel]}
    </button>
  );
}
