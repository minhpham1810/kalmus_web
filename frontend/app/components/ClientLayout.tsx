'use client';

import { ThemeProvider, useTheme, BG_COLORS } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { bgLevel } = useTheme();
  return (
    <div className="min-h-screen" style={{ background: BG_COLORS[bgLevel] }}>
      <ThemeToggle />
      {children}
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
