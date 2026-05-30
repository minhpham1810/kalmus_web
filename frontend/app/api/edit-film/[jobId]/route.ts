import {NextRequest, NextResponse} from "next/server";
import {withDb} from "@/lib/db";
import { syncJobMetadataMovie } from "@/lib/job-metadata";

/** GET */
export async function GET(
    _request: NextRequest,
    {params}: {params: Promise<{jobId: string}>}
) {
    const {jobId} = await params;

    try {
        const film = withDb((db) => {
            const row = db
            .prepare("SELECT job_id, title, imdb_id, released, type, runtime_minutes FROM films WHERE job_id = ?")
            .get(jobId) as {job_id: string; title: string; imdb_id: string | null;
                released: string | null; type:string | null; runtime_minutes: number | null } | undefined;
            if (!row) return null;

            const fetchNames = (table: string, joinTable: string, col:string): string[] => {
                const rows = db
                .prepare(
                    `SELECT t.name FROM ${table} t
                    JOIN ${joinTable} j ON t.id = j.${col}_id
                    WHERE j.job_id = ?`
                )
                .all(jobId) as {name:string}[];
            return rows.map((r) => r.name);
            };

        return {
        ...row,
        directors: fetchNames("directors", "film_directors", "director"),
        actors: fetchNames("actors", "film_actors", "actor"),
        genres: fetchNames("genres", "film_genres", "genre"),
        writers: fetchNames("writers", "film_writers", "writer"),
        languages: fetchNames("languages", "film_languages", "language"),
        countries: fetchNames("countries", "film_countries", "country"),
        };
    });

    if (!film){
        return NextResponse.json({error: "Film not found"}, {status:404});
    }
    return NextResponse.json(film)
    } catch (error) {
        console.error("GET /api/edit-film error:", error);
        return NextResponse.json({error: "Failed to load film"}, {status: 500});
    }
}

/**
 * PUT
 * updates film metadata and junction table
 * expects json with film metadata
 *
 * basically edit_database.py
 */
export async function PUT(
    request: NextRequest,
    {params}: {params: Promise<{jobId: string}>}
) {
    const {jobId} = await params;

    try {
        const body = await request.json();
        const {title, imdb_id, released, type, runtime_minutes, directors, actors,
            genres, writers, languages, countries} = body;

            if (!title || !title.trim()) {
                return NextResponse.json({error: "Title is required"}, {status: 400});
            }

        withDb((db) => {
            // update film table
            db.prepare(
                `UPDATE films
                SET title = ?, imdb_id = ?, released = ?, type = ?, runtime_minutes = ?
                WHERE job_id = ?`
            ).run(title, imdb_id, released, type, runtime_minutes, jobId);

            // update junction tables (ex: mutiple directors)
            // same logic as insert_links() in db.py
            function updateJunction(names: string[], entityTable: string, junctionTable: string, colPrefix: string) {
                db.prepare(`DELETE FROM ${junctionTable} WHERE job_id = ?`).run(jobId);

                if (!names || names.length === 0) return;

                const findStmt = db.prepare(`SELECT id FROM ${entityTable} WHERE name = ?`);
                const insertEntityStmt = db.prepare(`INSERT INTO ${entityTable} (name) VALUES (?)`);
                const insertLinkStmt = db.prepare(`INSERT OR IGNORE INTO ${junctionTable} (job_id, ${colPrefix}_id) VALUES (?, ?)`);

                for (const name of names) {
                    const trimmed = name.trim();
                    if (!trimmed) continue;

                    const existing = findStmt.get(trimmed) as {id: number} | undefined;
                    const entityId = existing ? existing.id : insertEntityStmt.run(trimmed).lastInsertRowid;
                    insertLinkStmt.run(jobId, entityId);
                }
            }

            updateJunction(directors, "directors", "film_directors", "director");
            updateJunction(actors, "actors", "film_actors", "actor");
            updateJunction(genres, "genres", "film_genres", "genre");
            updateJunction(writers, "writers", "film_writers", "writer");
            updateJunction(languages, "languages", "film_languages", "language");
            updateJunction(countries, "countries", "film_countries", "country");

            //delete old row and insert updated matadata
            db.prepare("DELETE FROM films_search WHERE job_id = ?").run(jobId);

            db.prepare(
                `INSERT INTO films_search (job_id, title, director, actor, country, genre, language, writer)
                SELECT
                f.job_id,
                f.title,
                COALESCE(d.directors, ''),
                COALESCE(a.actors, ''),
                COALESCE(c.countries, ''),
                COALESCE(g.genres, ''),
                COALESCE(l.languages, ''),
                COALESCE(w.writers, '')
                FROM films f
                LEFT JOIN (
                SELECT fd.job_id, GROUP_CONCAT(DISTINCT d.name) AS directors
                FROM film_directors fd JOIN directors d ON d.id = fd.director_id
                GROUP BY fd.job_id
                ) d ON d.job_id = f.job_id
                LEFT JOIN (
                SELECT fa.job_id, GROUP_CONCAT(DISTINCT a.name) AS actors
                FROM film_actors fa JOIN actors a ON a.id = fa.actor_id
                GROUP BY fa.job_id
                ) a ON a.job_id = f.job_id
                LEFT JOIN (
                SELECT fc.job_id, GROUP_CONCAT(DISTINCT c.name) AS countries
                FROM film_countries fc JOIN countries c ON c.id = fc.country_id
                GROUP BY fc.job_id
                ) c ON c.job_id = f.job_id
                LEFT JOIN (
                SELECT fg.job_id, GROUP_CONCAT(DISTINCT g.name) AS genres
                FROM film_genres fg JOIN genres g ON g.id = fg.genre_id
                GROUP BY fg.job_id
                ) g ON g.job_id = f.job_id
                LEFT JOIN (
                SELECT fl.job_id, GROUP_CONCAT(DISTINCT l.name) AS languages
                FROM film_languages fl JOIN languages l ON l.id = fl.language_id
                GROUP BY fl.job_id
                ) l ON l.job_id = f.job_id
                LEFT JOIN (
                SELECT fw.job_id, GROUP_CONCAT(DISTINCT w.name) AS writers
                FROM film_writers fw JOIN writers w ON w.id = fw.writer_id
                GROUP BY fw.job_id
                ) w ON w.job_id = f.job_id
                WHERE f.job_id = ?`
            ).run(jobId);
        });

        await syncJobMetadataMovie(jobId, {
            title,
            imdbId: imdb_id,
            released,
            type,
            runtimeMinutes: runtime_minutes,
            directors,
            genres,
            countries,
        });

        return NextResponse.json({success:true});
    } catch (error) {
        console.error("PUT /api/edit-film error:", error);
        return NextResponse.json({error: "Failed to update film"}, {status: 500});
    }
}

/**
 * DELETE
 * same as delete_job() in db.py
 */
export async function DELETE(
    _request: NextRequest,
    {params}: {params: Promise<{jobId: string}>}
) {
    const {jobId} = await params;

    try {
        withDb((db) => {
            const junctionTables = [
               "film_genres",
                "film_directors",
                "film_writers",
                "film_actors",
                "film_languages",
                "film_countries",
            ];

            for (const table of junctionTables) {
                db.prepare(`DELETE FROM ${table} WHERE job_id = ?`).run(jobId);
            }

            // deete from main table
            db.prepare("DELETE FROM analyzed_files WHERE job_id = ?").run(jobId);
            db.prepare("DELETE FROM films WHERE job_id = ?").run(jobId);

            // Delete from the FTS search table
            db.prepare("DELETE FROM films_search WHERE job_id = ?").run(jobId);
        });

        return NextResponse.json({success: true});
    } catch(error) {
        console.error("DELETE /api/edit-film error:", error);
        return NextResponse.json({error: "Failed to delete film"}, {status:500});
    }
}
