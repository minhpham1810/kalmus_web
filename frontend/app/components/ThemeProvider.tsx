'use client';

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import {
  BG_CYCLE,
  DARK_BG_LEVELS,
  normalizeBgLevel,
  type BgLevel,
} from './theme';

const THEME_STORAGE_KEY = 'theme';
const THEME_CHANGE_EVENT = 'kalmus-theme-change';

interface ThemeContextType {
  bgLevel: BgLevel;
  cycleBg: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getThemeSnapshot(): BgLevel {
  if (typeof window === 'undefined') {
    return 'gray10';
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
    (): BgLevel => 'gray10'
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', DARK_BG_LEVELS.has(bgLevel));
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
