import Link from "next/link";
import { notFound } from "next/navigation";
import { withDb } from "@/lib/db";
import { VARIANTS, type MapFilm, type Variant } from "@/lib/film-map";
import { FilmMap } from "../../components/FilmMap";

export const dynamic = "force-dynamic";

export default async function MapVariantPage({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  if (!(variant in VARIANTS)) notFound();

  const films = withDb((db) =>
    (
      db
        .prepare(
          `SELECT m.job_id, m.primary_hue AS hue, m.mean_hue, m.hue_hist, m.lightness,
            f.title, f.released_year AS year, af.edition
          FROM film_map m
          JOIN analyzed_files af ON af.job_id = m.job_id
          JOIN films f ON f.id = af.film_id`,
        )
        .all() as (Omit<MapFilm, "hue_hist"> & { hue_hist: string | null })[]
    ).map((f) => ({ ...f, hue_hist: f.hue_hist ? (JSON.parse(f.hue_hist) as number[]) : null })),
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
          {(Object.keys(VARIANTS) as Variant[]).map((v) => (
            <Link
              key={v}
              href={v === "dominant" ? "/map" : `/map/${v}`}
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
