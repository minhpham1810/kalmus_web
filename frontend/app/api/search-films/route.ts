import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from "next/server";
import { getAnalysesByImdbId, FilmSearchResult, withDb } from "@/lib/db";

const IMDB_ID_PATTERN = /^tt\d{5,8}$/i;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const random = request.nextUrl.searchParams.has("random");

  if (!q && !random) {
    return NextResponse.json({ results: [] });
  }

  try {
    let rawResults: FilmSearchResult[];

    if (IMDB_ID_PATTERN.test(q)) {
      rawResults = getAnalysesByImdbId(q);
    }
    else if (random) {
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
          af.process_date,
          af.source_width,
          af.source_height,
          af.source_fps,
          af.source_frame_count
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

        ORDER BY RANDOM()
        LIMIT 5`
      );

      rawResults = withDb((db) => db
        .prepare(sql)
        .all() as FilmSearchResult[]
      );
    }
    else {
      const ret = buildQuery(q);
      let clause: string = "";
      let params: (string | number)[] = [];
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
          af.process_date,
          af.source_width,
          af.source_height,
          af.source_fps,
          af.source_frame_count
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

      rawResults = withDb((db) => db
        .prepare(sql)
        .all(params) as FilmSearchResult[]
      );
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
  const trimmed = q.trim();
  if (!trimmed) {
    return null;
  }

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

function buildFtsQuery(input: string) {
  // Extract year/decade filters before FTS processing
  const yearParams: number[] = [];
  const yearClauses: string[] = [];

  input = input.replace(/\byear\s*:\s*((\d{4})(?:-(\d{4}))?)/g, (_, __, from, to) => {
    if (to) {
      yearClauses.push('f.released_year BETWEEN ? AND ?');
      yearParams.push(parseInt(from), parseInt(to));
    } else {
      yearClauses.push('f.released_year = ?');
      yearParams.push(parseInt(from));
    }
    return '';
  });

  input = input.replace(/\bdecade\s*:\s*(\d{4})/g, (_, d) => {
    const start = Math.floor(parseInt(d) / 10) * 10;
    yearClauses.push('f.released_year BETWEEN ? AND ?');
    yearParams.push(start, start + 9);
    return '';
  });




  const stopwords = new Set([
    "the",
    "a",
    "an",
    "of"
  ]);

  const operators = new Set([
    "AND",
    "OR",
    "NOT",
    "NEAR",
    "(",
    ")"
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

  let remaining = input;

  const placeholders: string[] = [];
  const pushPlaceholder = (value: string) => {
    const key = `__P${placeholders.length}__`;
    placeholders.push(value);
    return key;
  }

  // Replace hyphens with en dash
  // En dash is not a used character in fts5
  // Could maybe be used in future for hyphenated words
  remaining = remaining.replace(/-/g, "–");

  // Get col searches, allowing quoted values for multi-word searches
  remaining = remaining.replace(/\b([\w]+)\s*:\s*(?:"([^"]*)"|(\S+))/g,
    (m, col, quoted, unquoted) => {
      let value = quoted ?? unquoted ?? "";

      // Missing value
      if (!value || value.trim() === "") {
        return `${col}*`;
      }

      // Invalid column
      if (!allowedCols.has(col)) {
        const clean = (value ?? "")
          .replace(/["():]/g, "")
          .trim();

        let valuePart = clean || "";
        if (!valuePart.endsWith("*")) {
          valuePart = `${valuePart}*`;
        }

        return `${col}* ${valuePart}`;
      }

      value = value.trim();
      if (!quoted &&!value.endsWith("*")) {
        value = `${value}*`;
      }

      return pushPlaceholder(`${col}: ${value}`);
    }
  );

  // Get phrase searches
  remaining = remaining.replace(/"((?:[^"\\]|\\.)*)"/g, (m) => {
    return pushPlaceholder(m);
  });

  // Get remaining tokens
  const tokens = remaining.match(/(\(|\)|AND|OR|NOT|NEAR|[\w-]+|"[^\"]*")/gi) || [];
  
  const processed = tokens.map((token) => {
    const upper = token.toUpperCase();
    if (operators.has(upper)) {
      return token;
    }

    // Skip placeholders
    if (/^__P\d+__$/.test(token)) {
      return token;
    }

    // Skip stopwords
    // if (stopwords.has(token.toLowerCase())) {
    //   return "";
    // }

    // Add fuzzy searches
    if (!token.endsWith("*")) {
      return `${token}*`;
    }

    return token;
  })
  
  let ftsParams = processed.join(" ");
  ftsParams = ftsParams.replace(/__P(\d+)__/g, (_, i) => placeholders[+i]);

  const allClauses = [];
  const allParams = [];

  if (ftsParams) {
    allClauses.push(`films_search MATCH ?`);
    allParams.push(ftsParams);
  }

  if (yearClauses.length > 0) {
    allClauses.push(...yearClauses);
    allParams.push(...yearParams);
  }

  // No valid search terms after cleaning
  if (allClauses.length === 0) {
    return null;
  }
  return {
    clause: allClauses.join(" AND "),
    params: allParams as (string | number)[],
  };
}
