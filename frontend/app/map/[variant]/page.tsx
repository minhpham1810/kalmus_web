import Link from "next/link";
import { notFound } from "next/navigation";
import { withDb } from "@/lib/db";
import { SHOWN_VARIANTS, VARIANTS, type MapFilm, type Variant } from "@/lib/film-map";
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
  type Row = Omit<MapFilm, "hue_hist" | "display_hist" | "countries" | "directors" | "genres"> &
    Record<"hue_hist" | "display_hist" | "countries" | "directors" | "genres", string | null>;
  const hist = (s: string | null) => (s ? (JSON.parse(s) as number[]) : null);

  const films = withDb((db) =>
    (
      db
        .prepare(
          `SELECT m.job_id, m.primary_hue AS hue, m.mean_hue, m.hue_hist, m.display_hist, m.lightness,
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
      display_hist: hist(f.display_hist),
      countries: split(f.countries),
      directors: split(f.directors),
      genres: split(f.genres),
    })),
  );

  return (
    <div className="min-h-screen">
      <div className="fixed top-5 left-6 z-50">
        <Link
          href="/"
          className="text-base kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
        >
          ← Back
        </Link>
      </div>
      {/* Variant switcher, for A/B comparing the map designs */}
      <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1 pointer-events-none">
        <div className="flex flex-wrap justify-center gap-4 pointer-events-auto">
          {SHOWN_VARIANTS.map((v) => (
            <Link
              key={v}
              href={v === SHOWN_VARIANTS[0] ? "/map" : `/map/${v}`}
              className={`font-mono text-xs tracking-[0.22em] uppercase transition-colors ${
                v === variant
                  ? "kalmus-text-primary underline underline-offset-4"
                  : "kalmus-text-secondary hover:text-[var(--text-primary)]"
              }`}
            >
              {VARIANTS[v].label}
            </Link>
          ))}
        </div>
        <p className="text-xs kalmus-text-muted max-w-xl text-center">
          {VARIANTS[variant as Variant].blurb}
        </p>
      </nav>
      <FilmMap films={films} variant={variant as Variant} />
    </div>
  );
}
