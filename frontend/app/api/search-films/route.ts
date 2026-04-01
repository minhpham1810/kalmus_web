import { NextRequest, NextResponse } from "next/server";
import { getDb, getAnalysesByImdbId, FilmSearchResult } from "@/lib/db";

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
      results = getAnalysesByImdbId(q);
    } else {
      const ftsQuery = q
        .trim()
        .split(/\s+/)
        .map((term) => term + "*")
        .join(" ");

      results = db
        .prepare(
          `SELECT f.id, f.title, f.imdb_id, f.released,
                  af.barcode_type, af.frame_type, af.metric, af.process_date
           FROM films_search
           JOIN films f ON f.id = films_search.film_id
           JOIN analyzed_files af ON f.id = af.film_id
           WHERE films_search MATCH ?
           ORDER BY f.title ASC, af.process_date DESC
           LIMIT 50`
        )
        .all(ftsQuery) as FilmSearchResult[];
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
