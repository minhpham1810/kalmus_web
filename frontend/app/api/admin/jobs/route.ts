import { NextResponse } from "next/server";
import { withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface JobRow {
  job_id: string;
  title: string | null;
  imdb_id: string | null;
  released: string | null;
  runtime_minutes: number | null;
  uploader: string | null;
  process_date: string | null;
  barcode_type: string | null;
  frame_type: string | null;
  metric: string | null;
  source_width: number | null;
  source_height: number | null;
  source_fps: number | null;
  source_frame_count: number | null;
  director: string | null;
  country: string | null;
}

export async function GET() {
  try {
    const jobs = withDb((db) =>
      db
        .prepare(
          `SELECT
            f.job_id,
            f.title,
            f.imdb_id,
            f.released,
            f.runtime_minutes,
            af.uploader,
            af.process_date,
            af.barcode_type,
            af.frame_type,
            af.metric,
            af.source_width,
            af.source_height,
            af.source_fps,
            af.source_frame_count,
            d.director,
            c.country
          FROM analyzed_files af
          INNER JOIN films f ON f.job_id = af.job_id
          LEFT JOIN (
            SELECT fd.job_id, GROUP_CONCAT(dir.name, ', ') AS director
            FROM film_directors fd
            JOIN directors dir ON fd.director_id = dir.id
            GROUP BY fd.job_id
          ) d ON f.job_id = d.job_id
          LEFT JOIN (
            SELECT fc.job_id, GROUP_CONCAT(co.name, ', ') AS country
            FROM film_countries fc
            JOIN countries co ON fc.country_id = co.id
            GROUP BY fc.job_id
          ) c ON f.job_id = c.job_id
          ORDER BY af.process_date DESC, af.rowid DESC`,
        )
        .all() as JobRow[],
    );

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Admin jobs dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load jobs" },
      { status: 500 },
    );
  }
}