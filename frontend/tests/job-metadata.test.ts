import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("syncJobMetadataMovie updates result-page movie metadata after edits", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "kalmus-job-metadata-"));
  process.env.RESULTS_DIR = tmpDir;

  const jobId = "job-123";
  const jobDir = path.join(tmpDir, jobId);
  await mkdir(jobDir, { recursive: true });
  await writeFile(
    path.join(jobDir, "metadata.json"),
    JSON.stringify(
      {
        movie: {
          title: "Old Title",
          imdb_id: "tt0000001",
          year: "1999",
          genre: "Old Genre",
          director: "Old Director",
          poster_url: "https://example.com/poster.jpg",
          raw: {
            Title: "Old Title",
            Year: "1999",
            Released: "01 Jan 1999",
            Runtime: "100 min",
            Director: "Old Director",
            Genre: "Old Genre",
            Country: "Old Country",
            Type: "movie",
            imdbID: "tt0000001",
          },
        },
      },
      null,
      2,
    ),
  );

  const { syncJobMetadataMovie } = await import("../lib/job-metadata");

  await syncJobMetadataMovie(jobId, {
    title: "New Title",
    imdbId: "tt1234567",
    released: "2001-05-24",
    type: "movie",
    runtimeMinutes: 121,
    directors: ["Director One", "Director Two"],
    genres: ["Drama", "Thriller"],
    countries: ["United States", "Canada"],
  });

  const updated = JSON.parse(
    await readFile(path.join(jobDir, "metadata.json"), "utf-8"),
  ) as {
    movie: {
      title: string;
      imdb_id: string | null;
      year?: string;
      genre?: string;
      director?: string;
      poster_url?: string;
      raw?: Record<string, unknown>;
    };
  };

  assert.equal(updated.movie.title, "New Title");
  assert.equal(updated.movie.imdb_id, "tt1234567");
  assert.equal(updated.movie.year, "2001");
  assert.equal(updated.movie.genre, "Drama, Thriller");
  assert.equal(updated.movie.director, "Director One, Director Two");
  assert.equal(updated.movie.poster_url, "https://example.com/poster.jpg");
  assert.equal(updated.movie.raw?.Released, "May 24, 2001");
  assert.equal(updated.movie.raw?.Runtime, "121 min");
  assert.equal(updated.movie.raw?.Country, "United States, Canada");
});
