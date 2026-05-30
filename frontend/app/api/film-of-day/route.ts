import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getDailyFilmOffset, getUtcDayIndex } from "@/lib/film-of-day";
import { FilmSearchResult, withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface FilmCountRow {
  count: number;
}

interface FilmGroupRow {
  title: string;
  imdb_key: string;
}

export async function GET() {
  try {
    const filmCount = withDb((db) => {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS count
          FROM (
            SELECT f.title, COALESCE(f.imdb_id, '') AS imdb_key
            FROM films f
            INNER JOIN analyzed_files af ON af.job_id = f.job_id
            GROUP BY f.title, imdb_key
          )`,
        )
        .get() as FilmCountRow | undefined;

      return row?.count ?? 0;
    });

    const offset = getDailyFilmOffset(filmCount);
    const dayIndex = getUtcDayIndex();

    if (offset === null) {
      return NextResponse.json({ results: [], dayIndex });
    }

    const selectedFilm = withDb((db) =>
      db
        .prepare(
          `SELECT f.title, COALESCE(f.imdb_id, '') AS imdb_key
          FROM films f
          INNER JOIN analyzed_files af ON af.job_id = f.job_id
          GROUP BY f.title, imdb_key
          ORDER BY f.title ASC, imdb_key ASC
          LIMIT 1 OFFSET ?`,
        )
        .get(offset) as FilmGroupRow | undefined,
    );

    if (!selectedFilm) {
      return NextResponse.json({ results: [], dayIndex });
    }

    const rawResults = withDb((db) =>
      db
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
          WHERE f.title = ? AND COALESCE(f.imdb_id, '') = ?
          ORDER BY af.process_date DESC`,
        )
        .all(selectedFilm.title, selectedFilm.imdb_key) as FilmSearchResult[],
    );

    const results = await Promise.all(
      rawResults.map(async (film) => {
        let posterData: string | null = null;
        if (film.poster) {
          try {
            const fileBuffer = await fs.readFile(film.poster);
            posterData = `data:image/jpeg;base64,${fileBuffer.toString("base64")}`;
          } catch {
            posterData = null;
          }
        }

        return {
          ...film,
          poster: posterData,
        };
      }),
    );

    return NextResponse.json({ results, dayIndex });
  } catch (error) {
    console.error("Film of the day error:", error);
    return NextResponse.json(
      { error: "Failed to load film of the day" },
      { status: 500 },
    );
  }
}
