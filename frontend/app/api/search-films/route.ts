import { promises as fs } from 'fs';
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
    let rawResults: FilmSearchResult[];

    if (IMDB_ID_PATTERN.test(q)) {
      rawResults = getAnalysesByImdbId(q);
    } else {
      const ftsQuery = q
        .trim()
        .split(/\s+/)
        .map((term) => term + "*")
        .join(" ");

      rawResults = db
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
          FROM films_search
          JOIN films f ON f.id = films_search.film_id

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

          WHERE films_search MATCH ?
          ORDER BY f.title ASC, af.process_date DESC
          LIMIT 50`
        )
        .all(ftsQuery) as FilmSearchResult[];
    }

    // Map poster to browser URL
    const results = await Promise.all(
      rawResults.map(async (film) => {
        let posterData: string | null = null;
        if (film.poster) {
          const fileBuffer = await fs.readFile(film.poster);
          posterData = `data:image/jpeg;base64,${fileBuffer.toString("base64")}`;
        }
        return {
          ...film,
          poster: posterData,
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search films" },
      { status: 500 }
    );
  }
}
