import Database from "better-sqlite3";

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
  source_fps: string;
  source_frame_count: string;
}

const DB_PATH =
  process.env.FILMS_DB_PATH ||
  "/home/kalmus/kalmus/app/databases/films.db";

function normalizeAnalysisValue(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function getDb(): Database.Database {
    return new  Database(DB_PATH, {
        // This can be enabled, but due to concurrent writes to the database from the backend, it can cause disk I/O errors.
        // Enabling will not cause any crashes, but it will flood the logs.
        // For all purposes, the database is read-only from the frontend, so this should not cause any issues.
        //   readonly: true, 
        timeout: 5000,
    });
}

export function getAnalysesByImdbId(imdbId: string): FilmSearchResult[] {
  return withDb((db) => db
    .prepare(
      `SELECT 
        f.job_id,
        f.title,
        f.imdb_id,
        af.poster,
        d.director,
        f.runtime_minutes,
        c.country,
        f.released,
        af.barcode_type,
        af.frame_type,
        af.metric,
        af.process_date,
        af.source_width,
        af.source_height,
        af.source_fps,
        af.source_frame_count
      FROM films f
      INNER JOIN analyzed_files af ON af.job_id = f.job_id
      LEFT JOIN (
        SELECT fd.job_id, GROUP_CONCAT(d.name) AS director
        FROM film_directors fd
        JOIN directors d ON fd.director_id = d.id
        GROUP BY fd.job_id
      ) d ON f.job_id = d.job_id
      LEFT JOIN (
        SELECT fc.job_id, GROUP_CONCAT(c.name) AS country
        FROM film_countries fc
        JOIN countries c ON fc.country_id = c.id
        GROUP BY fc.job_id
      ) c ON f.job_id = c.job_id
      WHERE LOWER(f.imdb_id) = LOWER(?)
      ORDER BY af.process_date DESC`
    )
    .all(imdbId) as FilmSearchResult[]
    );
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
