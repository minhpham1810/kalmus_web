import { GroupedFilm } from "@/lib/admin-films";
import { buildMetadataParts } from "@/lib/film-format";

/**
 * renders film metadata
 */
export default function FilmMetadataLine({ film }: { film: GroupedFilm }) {
  const parts = buildMetadataParts(film);

  if (parts.length === 0) return null;

  return (
    <div className="font-mono text-base kalmus-text-secondary mt-1">
      <span>
        ({parts.join(", ")}
        {film.imdb_id && (
          <>
            ,{" "}
            <a
              href={`https://www.imdb.com/title/${film.imdb_id}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-50"
            >
              IMDb
            </a>
          </>
        )}
        )
      </span>
    </div>
  );
}