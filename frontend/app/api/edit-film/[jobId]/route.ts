import {NextRequest, NextResponse} from "next/server";
import {execFile} from "child_process";
import {promisify} from "util";
import path from "path";
import type Database from "better-sqlite3";
import {withDb} from "@/lib/db";
import {SLURM_CONFIG} from "@/lib/slurm";
import {validateOverride} from "@/lib/credits-trim";

const execFileAsync = promisify(execFile);

// Same key as the backend: edition_key is always computed in SQL, never in TypeScript
const EDITION_KEY_SQL = "LOWER(COALESCE(TRIM(af.edition), ''))";

// [entity table, link column prefix]; each has a film_<table> link table. Same as ENTITIES in db.py
const ENTITIES = [
    ["genres", "genre"],
    ["directors", "director"],
    ["writers", "writer"],
    ["actors", "actor"],
    ["languages", "language"],
    ["countries", "country"],
] as const;

/** Same DDL as create_db in db.py, so an older database that predates the table still works. */
function ensureCreditsOverride(db: Database.Database) {
    db.exec(
        `CREATE TABLE IF NOT EXISTS credits_override (
            film_id INTEGER NOT NULL REFERENCES films(id) ON DELETE CASCADE,
            edition_key TEXT NOT NULL,
            film_start_s REAL,
            credits_start_s REAL,
            PRIMARY KEY (film_id, edition_key)
        )`
    );
}

type Override = {film_start_s: number | null; credits_start_s: number | null};

/** Length of the job's source video in seconds, or null when the frame count or fps is missing. */
function sourceLengthS(db: Database.Database, jobId: string): number | null {
    const row = db
        .prepare("SELECT source_frame_count / source_fps AS length_s FROM analyzed_files WHERE job_id = ? AND source_fps > 0")
        .get(jobId) as {length_s: number | null} | undefined;
    return row?.length_s ?? null;
}

/** Runs film_map.py for one film; no keys = all of its edition keys. Rejects with the script's message. */
async function recomputeFilm(filmId: number, editionKeys: string[]) {
    const script = path.join(process.cwd(), "..", "backend", "film_map.py");
    const args = [script, "--film-id", String(filmId)];
    for (const key of editionKeys) args.push("--edition-key", key); // the key is user text, may be ""
    try {
        await execFileAsync(SLURM_CONFIG.pythonBin, args, {env: process.env, timeout: 300_000});
    } catch (e) {
        const err = e as Error & {stderr?: string};
        throw new Error(err.stderr?.trim() || err.message);
    }
}

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
                `SELECT af.job_id, af.edition, f.id AS film_id, f.title, f.imdb_id, f.released, f.released_year, f.type,
                    f.runtime_minutes, ${EDITION_KEY_SQL} AS edition_key
                FROM analyzed_files af JOIN films f ON f.id = af.film_id
                WHERE af.job_id = ?`
            )
            .get(jobId) as {job_id: string; edition: string | null; film_id: number; title: string; imdb_id: string | null;
                released: string | null; released_year: number | null; type:string | null; runtime_minutes: number | null;
                edition_key: string} | undefined;
            if (!row) return null;

            ensureCreditsOverride(db);
            const override = db
                .prepare("SELECT film_start_s, credits_start_s FROM credits_override WHERE film_id = ? AND edition_key = ?")
                .get(row.film_id, row.edition_key) as Override | undefined;

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
        length_s: sourceLengthS(db, jobId),
        film_start_s: override?.film_start_s ?? null,
        credits_start_s: override?.credits_start_s ?? null,
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
 * updates the metadata of the job's film (shared by every analysis of that film) and its junction tables,
 * plus this job's edition and its credits trim override (per film + edition key).
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
        const {title, imdb_id, edition, released, type, runtime_minutes, directors, actors,
            genres, writers, languages, countries} = body;
        // numbers or null; both null clears the override, both absent leaves it as it is
        const overrideSent = "film_start_s" in body || "credits_start_s" in body;
        const newOverride: Override = {film_start_s: body.film_start_s ?? null, credits_start_s: body.credits_start_s ?? null};

            if (!title || !title.trim()) {
                return NextResponse.json({error: "Title is required"}, {status: 400});
            }

        const names: Record<string, string[]> = {directors, actors, genres, writers, languages, countries};
        const newImdbId: string | null = imdb_id?.trim() || null;

        if (overrideSent) {
            for (const v of [newOverride.film_start_s, newOverride.credits_start_s]) {
                if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) {
                    return NextResponse.json({error: "Use h:mm:ss, mm:ss or seconds."}, {status: 400});
                }
                if (v !== null && v < 0) {
                    return NextResponse.json({error: "Times can't be negative."}, {status: 400});
                }
            }
            const overrideError = withDb((db) =>
                validateOverride(newOverride.film_start_s, newOverride.credits_start_s, sourceLengthS(db, jobId)));
            if (overrideError) {
                return NextResponse.json({error: overrideError}, {status: 400});
            }
        }

        const result = withDb((db) => {
            ensureCreditsOverride(db);
            return db.transaction(() => {
            // old film and key, captured before anything is updated
            const job = db
            .prepare(
                `SELECT af.film_id, f.imdb_id, f.poster, ${EDITION_KEY_SQL} AS edition_key
                FROM analyzed_files af JOIN films f ON f.id = af.film_id
                WHERE af.job_id = ?`
            )
            .get(jobId) as {film_id: number; imdb_id: string | null; poster: string | null; edition_key: string} | undefined;
            if (!job) return null;

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

            // edition belongs to this job only; a trigger keeps the film's search row in sync
            db.prepare("UPDATE analyzed_files SET edition = ? WHERE job_id = ?").run(edition?.trim() || null, jobId);

            // the film that gets the new values may be an existing one (moved job), so read its year here, not the old film's
            const oldYear = (db.prepare("SELECT released_year FROM films WHERE id = ?").get(filmId) as {released_year: number | null}).released_year;

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
            const editions = "COALESCE((SELECT GROUP_CONCAT(DISTINCT a.edition) FROM analyzed_files a WHERE a.film_id = f.id), '')";
            db.prepare("DELETE FROM films_search WHERE film_id = ?").run(filmId);
            db.prepare(
                `INSERT INTO films_search (film_id, title, ${cols}, edition)
                SELECT f.id, f.title, ${aggregates}, ${editions} FROM films f WHERE f.id = ?`
            ).run(filmId);

            const newYear = (db.prepare("SELECT released_year FROM films WHERE id = ?").get(filmId) as {released_year: number | null}).released_year;
            const newKey = (db.prepare(`SELECT ${EDITION_KEY_SQL} AS k FROM analyzed_files af WHERE af.job_id = ?`).get(jobId) as {k: string}).k;

            // The override belongs to a film + edition. Only when this save leaves both alone is it written;
            // otherwise the job just picks up whatever its new film + edition already has, and no row is touched.
            const sameTarget = filmId === job.film_id && newKey === job.edition_key;
            // Warn only when the admin actually edited the trim: the sent values differ from the old film + key's row
            const oldRow = db
                .prepare("SELECT film_start_s, credits_start_s FROM credits_override WHERE film_id = ? AND edition_key = ?")
                .get(job.film_id, job.edition_key) as Override | undefined;
            const overrideIgnored = overrideSent && !sameTarget
                && ((oldRow?.film_start_s ?? null) !== newOverride.film_start_s
                    || (oldRow?.credits_start_s ?? null) !== newOverride.credits_start_s);
            let overrideChanged = false;
            if (overrideSent && sameTarget) {
                const before = db
                    .prepare("SELECT film_start_s, credits_start_s FROM credits_override WHERE film_id = ? AND edition_key = ?")
                    .get(filmId, newKey) as Override | undefined;
                overrideChanged = (before?.film_start_s ?? null) !== newOverride.film_start_s
                    || (before?.credits_start_s ?? null) !== newOverride.credits_start_s;
                db.prepare("DELETE FROM credits_override WHERE film_id = ? AND edition_key = ?").run(filmId, newKey);
                if (newOverride.film_start_s !== null || newOverride.credits_start_s !== null) {
                    db.prepare(
                        "INSERT INTO credits_override (film_id, edition_key, film_start_s, credits_start_s) VALUES (?, ?, ?, ?)"
                    ).run(filmId, newKey, newOverride.film_start_s, newOverride.credits_start_s);
                }
            }

            // what now applies to the job, for the editor to show
            const current = db
                .prepare("SELECT film_start_s, credits_start_s FROM credits_override WHERE film_id = ? AND edition_key = ?")
                .get(filmId, newKey) as Override | undefined;

            return {
                oldFilmId: job.film_id, oldKey: job.edition_key, filmId, newKey,
                yearChanged: oldYear !== newYear, overrideChanged, overrideIgnored,
                film_start_s: current?.film_start_s ?? null, credits_start_s: current?.credits_start_s ?? null,
            };
            })();
        });

        if (!result) {
            return NextResponse.json({error: "Film not found"}, {status: 404});
        }

        // Recompute the map points the save touched. A failure never undoes the save.
        const {oldFilmId, oldKey, filmId, newKey, yearChanged, overrideChanged} = result;
        const moved = filmId !== oldFilmId;
        const keyChanged = newKey !== oldKey;
        let recomputeError: string | undefined;
        try {
            if (yearChanged) {
                await recomputeFilm(filmId, []); // the year moves every edition across the 1975 rule
            } else if (overrideChanged || keyChanged || moved) {
                await recomputeFilm(filmId, [newKey]);
            }
            if (moved || keyChanged) {
                await recomputeFilm(oldFilmId, [oldKey]);
            }
        } catch (e) {
            console.error("PUT /api/edit-film recompute error:", e);
            recomputeError = (e as Error).message;
        }
        return NextResponse.json({
            success: true,
            film_start_s: result.film_start_s,
            credits_start_s: result.credits_start_s,
            ...(result.overrideIgnored ? {overrideIgnored: true} : {}),
            ...(recomputeError ? {recomputeError} : {}),
        });
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
