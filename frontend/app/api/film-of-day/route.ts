import { NextResponse } from "next/server";
import { getDailyFilmOffset, getEasternDayIndex } from "@/lib/film-of-day";
import { ANALYSIS_SELECT, FilmSearchResult, readPoster, withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface FilmCountRow {
  count: number;
}

interface FilmIdRow {
  id: number;
}

export async function GET() {
  try {
    // Films with no analyses are removed by a database trigger, so every film counts
    const filmCount = withDb((db) => {
      const row = db
        .prepare(`SELECT COUNT(*) AS count FROM films`)
        .get() as FilmCountRow | undefined;

      return row?.count ?? 0;
    });

    const offset = getDailyFilmOffset(filmCount);
    const dayIndex = getEasternDayIndex();

    if (offset === null) {
      return NextResponse.json({ results: [], dayIndex });
    }

    const selectedFilm = withDb((db) =>
      db
        .prepare(
          `SELECT id FROM films
          ORDER BY title ASC, COALESCE(imdb_id, '') ASC, id ASC
          LIMIT 1 OFFSET ?`,
        )
        .get(offset) as FilmIdRow | undefined,
    );

    if (!selectedFilm) {
      return NextResponse.json({ results: [], dayIndex });
    }

    const rawResults = withDb((db) =>
      db
        .prepare(
          `${ANALYSIS_SELECT}
          WHERE f.id = ?
          ORDER BY af.process_date DESC`,
        )
        .all(selectedFilm.id) as FilmSearchResult[],
    );

    const results = await Promise.all(
      rawResults.map(async (film) => ({
        ...film,
        poster: await readPoster(film.poster),
      })),
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
