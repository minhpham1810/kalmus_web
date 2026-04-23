'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export type BgLevel = 'grey10' | 'grey40' | 'grey60' | 'grey90';
const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'kalmus-theme-change';

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

function isBgLevel(value: string | null): value is BgLevel {
  return value !== null && BG_CYCLE.includes(value as BgLevel);
}

function getThemeSnapshot(): BgLevel {
  if (typeof window === 'undefined') {
    return 'grey10';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isBgLevel(stored) ? stored : 'grey10';
}

function subscribeThemeChange(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleThemeChange = () => callback();

  window.addEventListener('storage', handleThemeChange);
  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

  return () => {
    window.removeEventListener('storage', handleThemeChange);
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  };
}

function setTheme(nextBgLevel: BgLevel) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, nextBgLevel);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const bgLevel = useSyncExternalStore<BgLevel>(
    subscribeThemeChange,
    getThemeSnapshot,
    (): BgLevel => 'grey10'
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', ['grey10', 'grey40', 'grey60'].includes(bgLevel));
    root.setAttribute('data-bg-level', bgLevel);
  }, [bgLevel]);

  const cycleBg = () => {
    const idx = BG_CYCLE.indexOf(bgLevel);
    setTheme(BG_CYCLE[(idx + 1) % BG_CYCLE.length]);
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
