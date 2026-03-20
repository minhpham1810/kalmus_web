'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type BgLevel = 'grey10' | 'grey40' | 'grey60' | 'grey90';

export const BG_COLORS: Record<BgLevel, string> = {
  grey10: 'linear-gradient(135deg, #050508 0%, #0a0a0c 50%, #0d0d12 100%)',
  grey40: 'linear-gradient(135deg, #0a0a0c 0%, #12121a 50%, #1a1a24 100%)',
  grey60: 'linear-gradient(135deg, #0d0d12 0%, #1a1a24 50%, #252530 100%)',
  grey90: 'linear-gradient(135deg, #c8c5c0 0%, #e0ddd8 50%, #f0ede8 100%)',
};

const BG_CYCLE: BgLevel[] = ['grey10', 'grey40', 'grey60', 'grey90'];

interface ThemeContextType {
  bgLevel: BgLevel;
  cycleBg: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [bgLevel, setBgLevel] = useState<BgLevel>(() => {
    if (typeof window === 'undefined') {
      return 'grey10';
    }

    const stored = localStorage.getItem('theme') as BgLevel | null;
    return stored && BG_CYCLE.includes(stored) ? stored : 'grey10';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', ['grey10', 'grey40', 'grey60'].includes(bgLevel));
    root.setAttribute('data-bg-level', bgLevel);
    localStorage.setItem('theme', bgLevel);
  }, [bgLevel]);

  const cycleBg = useCallback(() => {
    setBgLevel(prev => {
      const idx = BG_CYCLE.indexOf(prev);
      return BG_CYCLE[(idx + 1) % BG_CYCLE.length];
    });
  }, []);

  const value = useMemo(() => ({ bgLevel, cycleBg }), [bgLevel, cycleBg]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
