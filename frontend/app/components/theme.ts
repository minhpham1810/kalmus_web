export type BgLevel = 'gray10' | 'gray30' | 'gray60' | 'gray90';

export const BG_COLORS: Record<BgLevel, string> = {
  gray10: '#1a1a1a',
  gray30: '#4d4d4d',
  gray60: '#999999',
  gray90: '#e6e6e6',
};

export const THEME_LABELS: Record<BgLevel, string> = {
  gray10: '10%',
  gray30: '30%',
  gray60: '60%',
  gray90: '90%',
};

export const DARK_BG_LEVELS = new Set<BgLevel>(['gray10', 'gray30']);
export const BG_CYCLE: BgLevel[] = ['gray10', 'gray30', 'gray60', 'gray90'];

const LEGACY_BG_LEVELS: Record<string, BgLevel> = {
  black: 'gray10',
  white: 'gray90',
  grey10: 'gray10',
  grey40: 'gray30',
  grey60: 'gray60',
  grey90: 'gray90',
};

export function normalizeBgLevel(value: string | null): BgLevel {
  if (value === 'gray10' || value === 'gray30' || value === 'gray60' || value === 'gray90') {
    return value;
  }

  if (value && value in LEGACY_BG_LEVELS) {
    return LEGACY_BG_LEVELS[value];
  }

  return 'gray10';
}

export function getReadableTextColor(bgLevel: BgLevel) {
  return DARK_BG_LEVELS.has(bgLevel) ? '#ffffff' : '#000000';
}
