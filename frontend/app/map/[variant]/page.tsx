import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withDb } from "@/lib/db";
import { SHOWN_VARIANTS, type MapFilm, type Variant } from "@/lib/film-map";
import { FilmMap } from "../../components/FilmMap";

export const dynamic = "force-dynamic";

export default async function MapVariantPage({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!SHOWN_VARIANTS.includes(variant as Variant)) notFound();

  // A film's linked names, unit-separator joined (names can contain commas)
  const names = (table: string, col: string) =>
    `(SELECT GROUP_CONCAT(e.name, char(31)) FROM film_${table} j JOIN ${table} e ON e.id = j.${col}_id WHERE j.film_id = f.id) AS ${table}`;
  const split = (s: string | null) => (s ? s.split("\x1f") : []);
  type Row = Omit<MapFilm, "hue_hist" | "countries" | "directors" | "genres"> &
    Record<"hue_hist" | "countries" | "directors" | "genres", string | null>;
  const hist = (s: string | null) => (s ? (JSON.parse(s) as number[]) : null);

  const films = withDb((db) =>
    (
      db
        .prepare(
          `SELECT m.job_id, m.primary_hue AS hue, m.mean_hue, m.hue_hist, m.lightness,
            f.title, f.released_year AS year, af.edition,
            ${names("countries", "country")}, ${names("directors", "director")}, ${names("genres", "genre")}
          FROM film_map m
          JOIN analyzed_files af ON af.job_id = m.job_id
          JOIN films f ON f.id = af.film_id`,
        )
        .all() as Row[]
    ).map((f) => ({
      ...f,
      hue_hist: hist(f.hue_hist),
      countries: split(f.countries),
      directors: split(f.directors),
      genres: split(f.genres),
    })),
  );

  return (
    <div className="min-h-screen">
      {/* Heads the map's left column, above the filter */}
      <FilmMap films={films} variant={variant as Variant}>
        <Link
          href="/"
          className="self-start text-base kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
        >
          ← Back
        </Link>
        <Image src="/kalmusverse-logo.png" alt="KALMUSverse" width={270} height={40} priority />
        <p className="kalmus-text-secondary leading-snug">
          All the films in the KALMUS archive plotted by their dominant color (hue) and lightness. For example, darker
          films gravitate to the center and brighter films drift to the perimeter. Lines connect films with similar
          palettes and lightness.
        </p>
        {/* The one item that gives way on short screens, so the filter and film card always fit;
            object-contain keeps it square as its box shrinks */}
        <Image
          src="/hue-lightness.png"
          alt="Hue runs round the wheel, lightness outward from the center"
          width={240}
          height={240}
          className="size-60 min-h-0 object-contain object-left"
        />
      </FilmMap>
    </div>
  );
}
