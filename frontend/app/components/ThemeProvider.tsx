'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export type BgLevel = 'black' | 'white';
const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'kalmus-theme-change';

export const BG_COLORS: Record<BgLevel, string> = {
  black: '#000000',
  white: '#ffffff',
};

const BG_CYCLE: BgLevel[] = ['black', 'white'];
const LEGACY_BG_LEVELS: Record<string, BgLevel> = {
  grey10: 'black',
  grey40: 'black',
  grey60: 'black',
  grey90: 'white',
};

interface ThemeContextType {
  bgLevel: BgLevel;
  cycleBg: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function normalizeBgLevel(value: string | null): BgLevel {
  if (value === 'black' || value === 'white') {
    return value;
  }

  if (value && value in LEGACY_BG_LEVELS) {
    return LEGACY_BG_LEVELS[value];
  }

  return 'black';
}

function getThemeSnapshot(): BgLevel {
  if (typeof window === 'undefined') {
    return 'black';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return normalizeBgLevel(stored);
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
    (): BgLevel => 'black'
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', bgLevel === 'black');
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
