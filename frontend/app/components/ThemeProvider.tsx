'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type BgLevel = 'grey10' | 'grey40' | 'grey60' | 'grey90';

export const BG_COLORS: Record<BgLevel, string> = {
  grey10: 'linear-gradient(135deg, #060606 0%, #1a1a1a 100%)',
  grey40: 'linear-gradient(135deg, #060606 0%, #555555 100%)',
  grey60: 'linear-gradient(135deg, #111111 0%, #999999 100%)',
  grey90: 'linear-gradient(135deg, #c8c8c8 0%, #f5f5f5 100%)',
};

const BG_CYCLE: BgLevel[] = ['grey10', 'grey40', 'grey60', 'grey90'];

interface ThemeContextType {
  bgLevel: BgLevel;
  cycleBg: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [bgLevel, setBgLevel] = useState<BgLevel>('grey10');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('theme') as BgLevel | null;
    if (stored && BG_CYCLE.includes(stored)) {
      setBgLevel(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.toggle('dark', ['grey10', 'grey40', 'grey60'].includes(bgLevel));
    root.setAttribute('data-bg-level', bgLevel);
    localStorage.setItem('theme', bgLevel);
  }, [bgLevel, mounted]);

  const cycleBg = () => {
    setBgLevel(prev => {
      const idx = BG_CYCLE.indexOf(prev);
      return BG_CYCLE[(idx + 1) % BG_CYCLE.length];
    });
  };

  return (
    <ThemeContext.Provider value={{ bgLevel, cycleBg }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
