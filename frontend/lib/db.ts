import Database from "better-sqlite3";

export interface FilmSearchResult {
  id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime: string | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
}

const DB_PATH =
  process.env.FILMS_DB_PATH ||
  "/home/kalmus/kalmus/app/backend/databases/films.db";

let db: Database.Database | null = null;

function normalizeAnalysisValue(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export function getAnalysesByImdbId(imdbId: string): FilmSearchResult[] {
  return getDb()
    .prepare(
      `SELECT 
        f.id,
        f.title,
        f.imdb_id,
        af.poster,
        d.director,
        f.runtime,
        c.country,
        f.released,
        af.barcode_type,
        af.frame_type,
        af.metric,
        af.process_date
      FROM films f
      INNER JOIN analyzed_files af ON af.film_id = f.id
      LEFT JOIN (
        SELECT fd.film_id, GROUP_CONCAT(d.director) AS director
        FROM film_directors fd
        JOIN directors d ON fd.director_id = d.id
        GROUP BY fd.film_id
      ) d ON f.id = d.film_id
      LEFT JOIN (
        SELECT fc.film_id, GROUP_CONCAT(c.country) AS country
        FROM film_countries fc
        JOIN countries c ON fc.country_id = c.id
        GROUP BY fc.film_id
      ) c ON f.id = c.film_id
      WHERE LOWER(f.imdb_id) = LOWER(?)
      ORDER BY af.process_date DESC`
    )
    .all(imdbId) as FilmSearchResult[];
}

export function findDuplicateAnalyses(
  imdbId: string | null | undefined,
  analysisConfig: {
    barcode_type?: string | null;
    frame_type?: string | null;
    color_metric?: string | null;
  }
): {
  analyses: FilmSearchResult[];
  exactMatches: FilmSearchResult[];
  exactMatch: FilmSearchResult | null;
} {
  if (!imdbId) {
    return {
      analyses: [],
      exactMatches: [],
      exactMatch: null,
    };
  }

  const analyses = getAnalysesByImdbId(imdbId);
  const barcodeType = normalizeAnalysisValue(analysisConfig.barcode_type);
  const frameType = normalizeAnalysisValue(analysisConfig.frame_type);
  const metric = normalizeAnalysisValue(analysisConfig.color_metric);

  const exactMatches = analyses.filter(
    (analysis) =>
      normalizeAnalysisValue(analysis.barcode_type) === barcodeType &&
      normalizeAnalysisValue(analysis.frame_type) === frameType &&
      normalizeAnalysisValue(analysis.metric) === metric
  );

  return {
    analyses,
    exactMatches,
    exactMatch: exactMatches[0] || null,
  };
}
