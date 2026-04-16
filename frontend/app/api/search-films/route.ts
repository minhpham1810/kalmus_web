import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from "next/server";
import { getDb, getAnalysesByImdbId, FilmSearchResult } from "@/lib/db";

const IMDB_ID_PATTERN = /^tt\d{5,8}$/i;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const titleOnly = request.nextUrl.searchParams.get("titleOnly") === "true";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getDb();
    let rawResults: FilmSearchResult[];

    if (!titleOnly &&IMDB_ID_PATTERN.test(q)) {
      rawResults = getAnalysesByImdbId(q);
    } else {
      const { clause, params } = buildQuery(q.trim(), titleOnly);

      const sql = (
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

        WHERE ${clause}
        ORDER BY f.title ASC, af.process_date DESC
        LIMIT 50`
      );
      

      rawResults = db
        .prepare(sql)
        .all(params) as FilmSearchResult[];
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

function buildQuery(q: string, titleOnly: boolean) {
  if (titleOnly) {
    switch (q) {
      case "0-9":
        return {
          clause: `f.title GLOB '[0-9]*'`,
          params: [],
        };
      case "symbols":
        return {
          clause: `f.title GLOB '[^A-Za-z0-9]*'`,
          params: [],
        };
      default:
        return {
          clause: `f.title LIKE ?`,
          params: [`${q.trim()}%`],
        }
    }
  } else {
    return {
      clause: `films_search MATCH ?`,
      params: [buildFtsQuery(q)],
    };
  }
}

function buildFtsQuery(trimmed: string): string {

  const phraseMatches = [...trimmed.matchAll(/"([^"]+)"/g)];
  const phrases = phraseMatches.map(m => m[1]);

  const withoutPhrases = trimmed.replace(/"[^"]+"/g, "");

  const terms = withoutPhrases
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const wildcardTerms = terms.map(t => `${t}*`);

  const phraseTerms = phrases.map(p => `"${p}"`);

  return [...phraseTerms, ...wildcardTerms].join(" ");
}
