'use client';

import { ThemeProvider, useTheme, BG_COLORS } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

function ScanlineOverlay() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{
        background: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0, 0, 0, 0.03) 2px,
          rgba(0, 0, 0, 0.03) 4px
        )`
      }}
    />
  );
}

function FilmGrain() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[99] opacity-[0.015]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
      }}
    />
  );
}

function Vignette() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[98]"
      style={{
        background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)'
      }}
    />
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { bgLevel } = useTheme();
  const isDark = ['grey10', 'grey40', 'grey60'].includes(bgLevel);

  return (
    <div className="min-h-screen relative" style={{ background: BG_COLORS[bgLevel] }}>
      {isDark && <ScanlineOverlay />}
      {isDark && <FilmGrain />}
      {isDark && <Vignette />}
      <ThemeToggle />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LayoutInner>{children}</LayoutInner>
    </ThemeProvider>
  );
}
