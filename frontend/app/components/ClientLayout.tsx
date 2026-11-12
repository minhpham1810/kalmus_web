'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { BG_COLORS } from './theme';
import { ThemeToggle } from './ThemeToggle';

function LayoutInner({
  children,
  isMap,
}: {
  children: React.ReactNode;
  isMap: boolean;
}) {
  const { bgLevel } = useTheme();
  return (
    <div
      className="min-h-screen"
      style={{ background: isMap ? '#000' : BG_COLORS[bgLevel] }}
    >
      {!isMap && <ThemeToggle />}
      {children}
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === '/map' || (pathname?.startsWith('/map/') ?? false);
  return (
    <ThemeProvider locked={isMap ? 'gray10' : undefined}>
      <LayoutInner isMap={isMap}>{children}</LayoutInner>
    </ThemeProvider>
  );
}
