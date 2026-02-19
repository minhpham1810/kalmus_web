import Database from "better-sqlite3";

export interface FilmSearchResult {
  id: string;
  title: string;
  imdb_id: string | null;
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

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");
  }
  return db;
}
