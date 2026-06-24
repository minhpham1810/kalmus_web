const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * UTC time zone based index. Kept for cleanliness
 */
export function getUtcDayIndex(now = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

/**
 EST time zone index. Bucknell time (INCLUDING DAYLIGHT SAVING)
 */
export function getEasternDayIndex(now = Date.now()): number {
  const easternDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));

  // date to sable day index
  return Math.floor(
    new Date(`${easternDateStr}T00:00:00Z`).getTime() / MS_PER_DAY,
  );
}


export function getDailyFilmOffset(
  filmCount: number,
  now = Date.now(),
): number | null {
  if (filmCount <= 0) {
    return null;
  }

  return getEasternDayIndex(now) % filmCount;
}
