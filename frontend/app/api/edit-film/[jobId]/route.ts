import {NextRequest, NextResponse} from "next/server";
import {withDb} from "@/lib/db";

// [entity table, link column prefix]; each has a film_<table> link table. Same as ENTITIES in db.py
const ENTITIES = [
    ["genres", "genre"],
    ["directors", "director"],
    ["writers", "writer"],
    ["actors", "actor"],
    ["languages", "language"],
    ["countries", "country"],
] as const;

/** GET */
export async function GET(
    _request: NextRequest,
    {params}: {params: Promise<{jobId: string}>}
) {
    const {jobId} = await params;

    try {
        const film = withDb((db) => {
            const row = db
            .prepare(
                `SELECT af.job_id, f.id AS film_id, f.title, f.imdb_id, f.released, f.type, f.runtime_minutes
                FROM analyzed_files af JOIN films f ON f.id = af.film_id
                WHERE af.job_id = ?`
            )
            .get(jobId) as {job_id: string; film_id: number; title: string; imdb_id: string | null;
                released: string | null; type:string | null; runtime_minutes: number | null } | undefined;
            if (!row) return null;

            const fetchNames = (table: string, col:string): string[] => {
                const rows = db
                .prepare(
                    `SELECT t.name FROM ${table} t
                    JOIN film_${table} j ON t.id = j.${col}_id
                    WHERE j.film_id = ?`
                )
                .all(row.film_id) as {name:string}[];
            return rows.map((r) => r.name);
            };

        return {
        ...row,
        directors: fetchNames("directors", "director"),
        actors: fetchNames("actors", "actor"),
        genres: fetchNames("genres", "genre"),
        writers: fetchNames("writers", "writer"),
        languages: fetchNames("languages", "language"),
        countries: fetchNames("countries", "country"),
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
 * updates the metadata of the job's film (shared by every analysis of that film) and its junction tables.
 * Changing the IMDb ID moves this job to the film with that ID, creating one if needed;
 * other jobs keep their film. Films left without jobs are deleted by a database trigger.
 * expects json with film metadata
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

        const names: Record<string, string[]> = {directors, actors, genres, writers, languages, countries};
        const newImdbId: string | null = imdb_id?.trim() || null;

        const found = withDb((db) => db.transaction(() => {
            const job = db
            .prepare(
                `SELECT af.film_id, f.imdb_id, f.poster
                FROM analyzed_files af JOIN films f ON f.id = af.film_id
                WHERE af.job_id = ?`
            )
            .get(jobId) as {film_id: number; imdb_id: string | null; poster: string | null} | undefined;
            if (!job) return false;

            let filmId = job.film_id;
            if (newImdbId !== job.imdb_id) {
                const target = newImdbId
                    ? db.prepare("SELECT id FROM films WHERE imdb_id = ?").get(newImdbId) as {id: number} | undefined
                    : undefined;
                const {n} = db.prepare("SELECT COUNT(*) AS n FROM analyzed_files WHERE film_id = ?").get(filmId) as {n: number};

                if (target) {
                    filmId = target.id;
                } else if (n > 1) {
                    // Other jobs still use the current film, so split this job off into its own film
                    filmId = Number(db.prepare("INSERT INTO films (title, poster) VALUES (?, ?)").run(title, job.poster).lastInsertRowid);
                }
                // else: this job is the film's only one, so the film itself is updated below

                if (filmId !== job.film_id) {
                    db.prepare("UPDATE analyzed_files SET film_id = ? WHERE job_id = ?").run(filmId, jobId);
                }
            }

            // update film table
            db.prepare(
                `UPDATE films
                SET title = ?, imdb_id = ?, released = ?, type = ?, runtime_minutes = ?
                WHERE id = ?`
            ).run(title, newImdbId, released, type, runtime_minutes, filmId);

            // update junction tables (ex: mutiple directors)
            // same logic as upsert_job() in db.py
            for (const [table, col] of ENTITIES) {
                db.prepare(`DELETE FROM film_${table} WHERE film_id = ?`).run(filmId);

                const find = db.prepare(`SELECT id FROM ${table} WHERE name = ?`);
                const insertEntity = db.prepare(`INSERT INTO ${table} (name) VALUES (?)`);
                const insertLink = db.prepare(`INSERT OR IGNORE INTO film_${table} (film_id, ${col}_id) VALUES (?, ?)`);

                for (const name of names[table] ?? []) {
                    const trimmed = name.trim();
                    if (!trimmed) continue;

                    const existing = find.get(trimmed) as {id: number} | undefined;
                    insertLink.run(filmId, existing ? existing.id : insertEntity.run(trimmed).lastInsertRowid);
                }
            }

            // rebuild search row, same as _refresh_search() in db.py
            const cols = ENTITIES.map(([, col]) => col).join(", ");
            const aggregates = ENTITIES.map(([table, col]) =>
                `COALESCE((SELECT GROUP_CONCAT(DISTINCT e.name) FROM film_${table} j JOIN ${table} e ON e.id = j.${col}_id WHERE j.film_id = f.id), '')`
            ).join(", ");
            db.prepare("DELETE FROM films_search WHERE film_id = ?").run(filmId);
            db.prepare(
                `INSERT INTO films_search (film_id, title, ${cols})
                SELECT f.id, f.title, ${aggregates} FROM films f WHERE f.id = ?`
            ).run(filmId);

            return true;
        })());

        if (!found) {
            return NextResponse.json({error: "Film not found"}, {status: 404});
        }
        return NextResponse.json({success:true});
    } catch (error) {
        console.error("PUT /api/edit-film error:", error);
        return NextResponse.json({error: "Failed to update film"}, {status: 500});
    }
}

/**
 * DELETE
 * same as delete_job() in db.py: the film, its junction rows and search row
 * are removed by triggers/cascades once no other job uses it
 */
export async function DELETE(
    _request: NextRequest,
    {params}: {params: Promise<{jobId: string}>}
) {
    const {jobId} = await params;

    try {
        withDb((db) => {
            db.prepare("DELETE FROM analyzed_files WHERE job_id = ?").run(jobId);
        });

        return NextResponse.json({success: true});
    } catch(error) {
        console.error("DELETE /api/edit-film error:", error);
        return NextResponse.json({error: "Failed to delete film"}, {status:500});
    }
}
