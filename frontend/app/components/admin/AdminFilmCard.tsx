import Link from "next/link";
import { GroupedFilm } from "@/lib/admin-films";
import FilmMetadataLine from "./FilmMetadataLine";
import FilmCardBarcode from "./FilmCardBarcode";

/**
 * admin page film cards
 */
export interface AdminFilmCardProps {

  film: GroupedFilm;
  /**
   * enables admin mode
   */
  onEdit?: (jobId: string) => void;
  showBarcode?: boolean;
}

export default function AdminFilmCard({
  film,
  onEdit,
  showBarcode = false,
}: AdminFilmCardProps) {
  const isAdminMode = typeof onEdit === "function";
  const resultsHref = (jobId: string) =>
    isAdminMode ? `/results/${jobId}?from=admin` : `/results/${jobId}`;

  return (
    <div
      className="py-5 flex gap-5 group"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: "rgba(100,100,100,0.25)",
      }}
    >
      {/* poster (self-start prevents the poster from stretching to match a
          taller content column) */}
      <div className="w-[80px] aspect-[2/3] shrink-0 self-start">
        {film.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={film.poster}
            alt={film.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full kalmus-help flex items-center justify-center">
            No poster
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col justify-between flex-1 min-w-0 overflow-hidden">
        {/* Title + metadata */}
        <div>
          <h3 className="text-lg tracking-tight kalmus-text-primary leading-snug font-mono">
            {film.title}
          </h3>
          <FilmMetadataLine film={film} />
        </div>

        {/*  mini barcode preview (uses the first analysis's job) */}
        {showBarcode && film.analyses[0] && (
          <FilmCardBarcode jobId={film.analyses[0].job_id} />
        )}

        <div>
          {film.analyses.map((a) => (
            <div key={a.job_id} className="flex items-center gap-0">
              <Link
                href={resultsHref(a.job_id)}
                aria-label={`View result for ${film.title}`}
                className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] items-start sm:items-center gap-2 sm:gap-4 border-b-2 border-transparent py-2 sm:py-1 hover:border-blue-500 flex-1"
                style={isAdminMode ? { color: "var(--accent-amber)" } : undefined}
              >
                <div className="flex items-center gap-2 font-mono text-sm kalmus-text-secondary capitalize">
                  <span>{a.barcode_type}</span>
                  <span style={{ color: "var(--accent-crimson)" }}>|</span>
                  <span>{a.frame_type.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--accent-crimson)" }}>|</span>
                  <span>{a.metric}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-sm kalmus-text-secondary">
                  <span>Source File:</span>
                  <span>
                    {a.source_width} x {a.source_height},
                  </span>
                  <span>{Number(a.source_fps).toFixed(3)} fps,</span>
                  <span>{a.source_frame_count} frames</span>
                </div>
                <div className="justify-self-start sm:justify-self-end font-mono text-xs tracking-wider uppercase px-3 py-1.5 transition-colors text-[var(--text-muted)] hover:text-[var(--accent-amber)]">
                  <span>View</span>
                </div>
              </Link>

              {/* edit button */}
              {isAdminMode && (
                <button
                  onClick={() => onEdit!(a.job_id)}
                  className="font-mono text-xs tracking-wider uppercase transition-all flex items-center gap-1 shrink-0"
                  style={{
                    padding: "4px 10px",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--accent-amber)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}