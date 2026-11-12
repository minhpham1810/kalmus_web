// Mirrors frontend/lib/credits_trim.py - keep the constants and the rule in sync.
export const AUTO_LAST_WHOLE_YEAR = 1975;
export const AUTO_START_S = 60.0;
export const AUTO_END_S = 300.0;
export const MIN_KEEP_FRACTION = 0.5;

/** Parses h:mm:ss, mm:ss or plain seconds. "" -> null; anything else -> NaN. */
export function parseTime(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const parts = t.split(":");
  if (parts.length > 3) return Number.NaN;
  const nums: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!/^\d+(\.\d+)?$/.test(p)) return Number.NaN;
    nums.push(Number(p));
  }
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatTime(s: number): string {
  const total = Math.max(0, Math.round(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Same as keep_window(year, None, lengthS) in credits_trim.py. */
export function autoWindow(year: number | null, lengthS: number): [number, number] {
  const whole: [number, number] = [0, lengthS];
  if (year !== null && year <= AUTO_LAST_WHOLE_YEAR) return whole;
  const start = Math.min(Math.max(AUTO_START_S, 0), lengthS);
  const end = Math.min(Math.max(lengthS - AUTO_END_S, 0), lengthS);
  if (end - start < MIN_KEEP_FRACTION * lengthS) return whole;
  return [start, end];
}

/** Error text for an override the editor should reject, or null when it is fine. */
export function validateOverride(
  filmStartS: number | null,
  creditsStartS: number | null,
  lengthS: number | null,
): string | null {
  if ((filmStartS !== null && Number.isNaN(filmStartS)) || (creditsStartS !== null && Number.isNaN(creditsStartS))) {
    return "Use h:mm:ss, mm:ss or seconds.";
  }
  const start = filmStartS ?? 0;
  if (creditsStartS !== null && creditsStartS <= start) return "End credits must begin after the film starts.";
  if (lengthS !== null) {
    if (start > lengthS || (creditsStartS !== null && creditsStartS > lengthS)) {
      return `That's past the end of the video (${formatTime(lengthS)}).`;
    }
    const end = creditsStartS ?? lengthS;
    if (end - start < MIN_KEEP_FRACTION * lengthS) return "That keeps less than half the film.";
  }
  return null;
}
