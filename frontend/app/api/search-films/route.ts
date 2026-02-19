import { NextRequest, NextResponse } from "next/server";
import { getDb, FilmSearchResult } from "@/lib/db";

const IMDB_ID_PATTERN = /^tt\d{5,8}$/i;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getDb();
    let results: FilmSearchResult[];

    if (IMDB_ID_PATTERN.test(q)) {
      results = db
        .prepare(
          `SELECT f.id, f.title, f.imdb_id, f.released,
                  af.barcode_type, af.frame_type, af.metric, af.process_date
           FROM films f
           INNER JOIN analyzed_files af ON f.id = af.film_id
           WHERE LOWER(f.imdb_id) = LOWER(?)
           ORDER BY af.process_date DESC`
        )
        .all(q) as FilmSearchResult[];
    } else {
      results = db
        .prepare(
          `SELECT f.id, f.title, f.imdb_id, f.released,
                  af.barcode_type, af.frame_type, af.metric, af.process_date
           FROM films f
           INNER JOIN analyzed_files af ON f.id = af.film_id
           WHERE f.title LIKE ?
           ORDER BY f.title ASC, af.process_date DESC
           LIMIT 50`
        )
        .all(`%${q}%`) as FilmSearchResult[];
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search films" },
      { status: 500 }
    );
  }
}
