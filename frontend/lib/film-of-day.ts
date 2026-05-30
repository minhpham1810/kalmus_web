const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getUtcDayIndex(now = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

export function getDailyFilmOffset(
  filmCount: number,
  now = Date.now(),
): number | null {
  if (filmCount <= 0) {
    return null;
  }

  return getUtcDayIndex(now) % filmCount;
}
