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
      const ret = buildQuery(q.trim());
      let clause: string = "";
      let params: string[] = [];
      if (ret) {
        clause = ret["clause"]
        params = ret["params"]
      }

      const sql = (
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
          af.process_date
        FROM films_search
        JOIN films f ON f.job_id = films_search.job_id

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

        ${ret && clause ? `WHERE ${clause}` : ``}
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

function buildQuery(q: string) {
  if (q === "numbers") {
    return {
      clause: `f.title GLOB '[0-9]*'`,
      params: [],
    };
  }
  else if (q === "symbols") {
    return {
      clause: `f.title GLOB '[^A-Za-z0-9]*'`,
      params: [],
    };
  }
  else {
    return buildFtsQuery(q);
  }
}

function buildFtsQuery(trimmed: string) {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "of"
  ]);

  const allowedCols = new Set([
    "title",
    "director",
    "actor",
    "country",
    "genre",
    "language",
    "writer"
  ]);

  // Get phrase searches
  const phraseMatches = [...trimmed.matchAll(/"([^"]+)"/g)];
  const phrases = phraseMatches.map(m => m[1]);

  let remaining = trimmed.replace(/"[^"]+"/g, "");

  // Get col searches
  const colMatches = [...remaining.matchAll(/(\b\w+)\s*:\s*("[^"]+"|[^\s]+)/g)];
  const colTerms: string[] = []

  const usedSegments = new Set<string>();

  // Build col searches
  for (const match of colMatches) {
    const col = match[1];
    let value = match[2];

    if (!allowedCols.has(col)) continue;

    const isPhrase = value.startsWith('"') && value.endsWith('"');

    if (isPhrase) {
      value = value.slice(1, -1);
      colTerms.push(`${col}:"${value}"`);
    }
    else {
      const clean = value
      // .replace(/[^\w\d_\^]+/gu, "")
      .replace(/\*+$/, "");

      if (clean) {
        colTerms.push(`${col}:${clean}*`);
      }
    }
    
    usedSegments.add(match[0]);
  }

  // Remove col searches
  for (const seg of usedSegments) {
    remaining = remaining.replace(seg, "");
  }

  const terms = remaining
    .trim()
    .split(/\s+/)
    .map((t) => t
        // .replace(/[^\w\d_]+/gu, "")
        .toLowerCase()
    )
    .filter(Boolean);

  const filteredTerms = terms.length > 1
    ? terms.filter(t => !stopwords.has(t))
    : terms

  // Add wildcard to all remaining terms
  const wildcardTerms = filteredTerms.map(t => `${t}*`);

  // Build phrase terms
  const phraseTerms = phrases.map(p => `"${p}"`);

  const allTerms = [...phraseTerms, ...colTerms, ...wildcardTerms];

  // No valid search terms after cleaning
  if (allTerms.length === 0) {
    return null;
  }

  return {
    clause: `films_search MATCH ?`,
    params: [allTerms.join(" ")],
  };
}
