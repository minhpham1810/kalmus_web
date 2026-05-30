'use client';

import { useTheme } from './ThemeProvider';
import { BG_COLORS, THEME_LABELS, getReadableTextColor } from './theme';

export function ThemeToggle() {
  const { bgLevel, cycleBg } = useTheme();

  return (
    <button
      onClick={cycleBg}
      className="fixed top-4 right-4 px-3 py-2 rounded-lg z-50 text-xs font-mono transition-all border border-white/20 shadow-sm hover:opacity-80"
      style={{
        background: BG_COLORS[bgLevel],
        color: getReadableTextColor(bgLevel),
        borderColor: 'var(--input-border)',
      }}
      aria-label="Cycle grayscale theme"
    >
      {THEME_LABELS[bgLevel]}
    </button>
  );
}
