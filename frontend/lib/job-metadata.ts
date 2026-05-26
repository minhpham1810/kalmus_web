import { promises as fs } from "fs";
import path from "path";

const RESULTS_DIR = process.env.RESULTS_DIR || "/home/kalmus/kalmus/results";

interface JobMetadataMovie {
  title?: string;
  imdb_id?: string | null;
  year?: string;
  genre?: string;
  director?: string;
  plot?: string;
  poster_url?: string;
  raw?: Record<string, unknown>;
}

interface JobMetadataFile {
  movie?: JobMetadataMovie;
}

export interface JobMetadataMovieUpdate {
  title: string;
  imdbId: string | null;
  released: string | null;
  type: string | null;
  runtimeMinutes: number | null;
  directors: string[];
  genres: string[];
  countries: string[];
}

function getMetadataPath(jobId: string): string {
  return path.join(RESULTS_DIR, jobId, "metadata.json");
}

function formatDelimited(values: string[]): string | undefined {
  return values.length > 0 ? values.join(", ") : undefined;
}

function toReleasedLabel(released: string | null): string | undefined {
  if (!released) {
    return undefined;
  }

  const date = new Date(`${released}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return released;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function syncJobMetadataMovie(
  jobId: string,
  update: JobMetadataMovieUpdate,
): Promise<void> {
  const metadataPath = getMetadataPath(jobId);
  const content = await fs.readFile(metadataPath, "utf-8");
  const metadata = JSON.parse(content) as JobMetadataFile;

  const existingMovie = metadata.movie || {};
  const existingRaw = existingMovie.raw || {};
  const year = update.released?.slice(0, 4) || existingMovie.year;
  const genre = formatDelimited(update.genres);
  const director = formatDelimited(update.directors);
  const country = formatDelimited(update.countries);

  metadata.movie = {
    ...existingMovie,
    title: update.title,
    imdb_id: update.imdbId,
    year,
    genre: genre ?? existingMovie.genre,
    director: director ?? existingMovie.director,
    raw: {
      ...existingRaw,
      Title: update.title,
      Year: year ?? existingRaw.Year,
      Released: toReleasedLabel(update.released) ?? existingRaw.Released,
      Runtime:
        update.runtimeMinutes !== null
          ? `${update.runtimeMinutes} min`
          : existingRaw.Runtime,
      Director: director ?? existingRaw.Director,
      Genre: genre ?? existingRaw.Genre,
      Country: country ?? existingRaw.Country,
      Type: update.type ?? existingRaw.Type,
      imdbID: update.imdbId ?? existingRaw.imdbID,
    },
  };

  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}
