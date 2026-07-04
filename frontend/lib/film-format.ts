/**
 * metadata display helper
 */


export function formatList(value: string | null): string | null {
  return value ? value.split(",").join(" & ") : null;
}

/**
 * converts a runtime given  into `HhMm` string
 */
export function formatRuntime(minutes: string | number | null): string | null {
  if (minutes === null || minutes === undefined || minutes === "") return null;
  const total = Number(minutes);
  if (Number.isNaN(total)) return null;
  return `${Math.floor(total / 60)}h${total % 60}m`;
}

/**
 * extracts the release year from a date string
 */
export function formatYear(released: string | null): number | null {
  if (!released) return null;
  const year = new Date(released).getFullYear();
  return Number.isNaN(year) ? null : year;
}

/**
 * builds the ordered list of metadata parts shown in a film card's
 */
export function buildMetadataParts(film: {
  director: string | null;
  released: string | null;
  runtime_minutes: string | null;
  country: string | null;
}): (string | number)[] {
  return [
    formatList(film.director),
    formatYear(film.released),
    formatRuntime(film.runtime_minutes),
    formatList(film.country),
  ].filter((part): part is string | number => Boolean(part));
}