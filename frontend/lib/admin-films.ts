
/** A single analysis row as returned by the search / film-of-day APIs. */
export interface FilmSearchResult {
  job_id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime_minutes: string | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
  source_width: string;
  source_height: string;
  source_fps: number;
  source_frame_count: string;
}

/** one analysis for grouped filmes*/
export interface FilmAnalysis {
  job_id: string;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
  source_width: string;
  source_height: string;
  source_fps: number;
  source_frame_count: string;
}

export interface GroupedFilm {
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime_minutes: string | null;
  country: string | null;
  released: string | null;
  analyses: FilmAnalysis[];
}

export function groupResults(results: FilmSearchResult[]): GroupedFilm[] {
  const map = new Map<string, GroupedFilm>();
  for (const r of results) {
    const key = `${r.title}::${r.imdb_id ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        title: r.title,
        imdb_id: r.imdb_id,
        poster: r.poster,
        director: r.director,
        runtime_minutes: r.runtime_minutes,
        country: r.country,
        released: r.released,
        analyses: [],
      });
    }
    map.get(key)!.analyses.push({
      job_id: r.job_id,
      barcode_type: r.barcode_type,
      frame_type: r.frame_type,
      metric: r.metric,
      process_date: r.process_date,
      source_width: r.source_width,
      source_height: r.source_height,
      source_fps: r.source_fps,
      source_frame_count: r.source_frame_count,
    });
  }
  return Array.from(map.values());
}