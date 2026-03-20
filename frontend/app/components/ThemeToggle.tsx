'use client';

import { useTheme } from './ThemeProvider';
import { useEffect, useState } from 'react';

const BG_LABELS: Record<string, string> = {
  grey10: 'DARK_10',
  grey40: 'DARK_40',
  grey60: 'DARK_60',
  grey90: 'LIGHT_90',
};

export function ThemeToggle() {
  const { bgLevel, cycleBg } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="fixed top-4 right-4 w-20 h-9 rounded z-50 bg-neutral-900/50" />
    );
  }

  const isDark = ['grey10', 'grey40', 'grey60'].includes(bgLevel);

  return (
    <button
      onClick={cycleBg}
      className={`
        fixed top-4 right-4 px-3 py-2 rounded z-50 
        text-xs font-mono tracking-wider
        transition-all duration-300 
        border backdrop-blur-sm
        ${isDark 
          ? 'border-amber-500/30 text-amber-400/80 bg-black/40 hover:border-amber-500/50 hover:text-amber-400 hover:shadow-[0_0_15px_rgba(212,165,116,0.2)]' 
          : 'border-neutral-400/50 text-neutral-600 bg-white/40 hover:border-neutral-500 hover:text-neutral-800'
        }
      `}
      aria-label="Cycle background"
    >
      <span className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-amber-500 shadow-[0_0_6px_rgba(212,165,116,0.6)]' : 'bg-neutral-500'}`} />
        {BG_LABELS[bgLevel]}
      </span>
    </button>
  );
}
