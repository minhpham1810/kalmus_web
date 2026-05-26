"use client";

import {useState} from "react";

export interface FilmRecord {
  job_id: string;
  title: string;
  imdb_id: string | null;
  released: string | null;
  type: string | null;
  runtime_minutes: number | null;
  directors: string[];
  genres: string[];
  actors: string[];
  writers: string[];
  languages: string[];
  countries: string[];
}

interface FilmEditorProps {
  film: FilmRecord;
  onClose: () => void; // when the user clicks cancel, or x button
  onSaved: () => void; // successful save -> refreshes metadata
  onDeleted: () => void; // successful delete -> refreshes metada
}

/**
 * confirm dialogue for deletion
 */
function ConfirmDialog({
  title,
  body,
  onYes,
  onNo,
  danger,
}: {
  title: string;
  body: string;
  onYes: () => void;
  onNo: () => void;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.75)",
        backdropFilter: "blur(4px)",
      }}
    >
      { }
      <div
        className = "kalmus-surface"
        style = {{ maxWidth: 400, width: "90%", padding: "20px 24px" }}
      >
        { }
        <p
          className = "font-mono text-xs kalmus-text-primary"
          style = {{ margin: "0 0 6px", fontWeight: 600 }}
        >
          {title}
        </p>
        { }
        <p
          className = "font-mono text-xs kalmus-text-secondary"
          style = {{ margin: "0 0 20px", lineHeight: 1.6 }}
        >
          {body}
        </p>
        { /** buttons */}
        <div style = {{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick = {onNo}   // cancel
            className = "font-mono text-xs tracking-wider uppercase kalmus-text-muted"
            style={{
              padding: "5px 14px",
              background: "transparent",
              border: "1px solid var(--surface-border)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick = {onYes}  //confirm
            className = "font-mono text-xs tracking-wider uppercase"
            style={{
              padding: "5px 14px",
              cursor: "pointer",
              border: "none",
              // red for delete, yellow for non-destructive confirms
              background: danger
                ? "var(--accent-crimson)"
                : "var(--accent-amber)",
              color: "#000",
              fontWeight: 600,
            }}
          >
            {/* text change based on action */}
            {danger ? "Delete" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({
  msg,
  type,   // error or success
  onDone,
}: {
  msg: string;
  type: "success" | "error";
  onDone: () => void;
}) {

  useState(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t)
  });
  return (
    <div
      className = "font-mono text-xs tracking-wider uppercase"
      style = {{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "7px 20px",
        zIndex: 10000,
        background: type === "success" ? "var(--accent-amber)" : "var(--accent-crimson)",
        color: "#000",
        fontWeight: 600,
      }}
    >
      {msg}
    </div>
  );
}

// Reusable Tailwind class string for all form labels
const labelClass =
  "font-mono text-xs tracking-wider uppercase kalmus-text-muted";

// styling
const inputBaseStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};


/* ################################################################
   Opens from the right side of the screen when an admin clicks
                    edit button on a film card
   ############################################################### */
export default function FilmEditor({
  film,
  onClose,
  onSaved,
  onDeleted,
}: FilmEditorProps) {

  const [title, setTitle] = useState(film.title);
  const [imdbId, setImdbId] = useState(film.imdb_id ?? ""); // null becomes empty string for the input
  const [released, setReleased] = useState(film.released ?? "");
  const [type, setType] = useState(film.type ?? "");
  const [runtimeMinutes, setRuntimeMinutes] = useState(
    film.runtime_minutes?.toString() ?? "" // number → string for the input, null → ""
  );

  const [directors, setDirectors] = useState(film.directors.join(", "));
  const [actors, setActors] = useState(film.actors.join(", "));
  const [genres, setGenres] = useState(film.genres.join(", "));
  const [writers, setWriters] = useState(film.writers.join(", "));
  const [languages, setLanguages] = useState(film.languages.join(", "));
  const [countries, setCountries] = useState(film.countries.join(", "));

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);


  const split = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean); // removes empty strings

  /**
   * ends the edited form data to PUT /api/edit-film/[jobId].
   * The API route will update the `films` table and re-sync all junction tables.
   * On success: shows a toast and calls onSaved() after a short delay.
   * On failure: shows an error toast.
   */
  const handleSave = async () => {
    setSaving(true); // disables the Save button and shows "Saving…"
    try {
      const res = await fetch(`/api/edit-film/${film.job_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          imdb_id: imdbId || null,           // empty string → null for the database
          released: released || null,
          type: type || null,
          runtime_minutes: runtimeMinutes ? parseInt(runtimeMinutes) : null, // string → integer or null
          directors: split(directors),        // "A, B" → ["A", "B"]
          actors: split(actors),
          genres: split(genres),
          writers: split(writers),
          languages: split(languages),
          countries: split(countries),
        }),
      });

      if (!res.ok) {
        // Try to extract an error message from the response body
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }

      // Show success toast, then close the editor after a short delay
      // so the user can see the confirmation before the panel disappears
      setToast({ msg: `Saved — ${title}`, type: "success" });
      setTimeout(() => {
        onSaved(); // tells page.tsx to refresh search results and close the editor
      }, 800);
    } catch (e) {
      // Show error toast — the editor stays open so the user can retry
      setToast({
        msg: (e as Error).message || "Save failed",
        type: "error",
      });
    } finally {
      setSaving(false); // re-enable the Save button regardless of outcome
    }
  };

  /* handleDelete() — sends DELETE /api/edit-film/[jobId]. */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/edit-film/${film.job_id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }

      // Show "deleted" confirmation msg
      setToast({ msg: `Deleted — ${film.title}`, type: "error" });
      setTimeout(() => {
        onDeleted(); // sends page.tsx to refresh search results and close the editor
      }, 800);
    } catch (e) {
      setToast({
        msg: (e as Error).message || "Delete failed",
        type: "error",
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(false); // close confirm dialog
    }
  };

  return (
    <div
      style = {{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(6px)",
      }}
    >
      { }
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}

      { }
      {confirmDelete && (
        <ConfirmDialog
          title = "Delete film permanently"
          body = {`"${title}" results, and metadata will be removed. This cannot be undone.`}
          danger
          onNo = {() => setConfirmDelete(false)}
          onYes = {handleDelete}
        />
      )}

      { }
      <div style = {{ flex: 1 }} onClick={onClose} />

      { }
      <div
        style = {{
          width: "100%",
          maxWidth: 480,
          background: "var(--panel-gradient, #0d0d10)",
          borderLeft: "1px solid var(--surface-border)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          animation: "editPanelSlideIn .2s ease",
        }}
      >
        { }
        <div
          style = {{
            padding: "14px 20px",
            borderBottom: "1px solid var(--surface-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            background: "var(--panel-gradient, #0d0d10)",
            zIndex: 2,
          }}
        >
          <span
            className = "font-mono text-xs tracking-wider uppercase"
            style={{ color: "var(--accent-amber)" }}
          >
            Edit Film
          </span>
          { }
          <button
            onClick = {onClose}
            style = {{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--accent-crimson)",
            }}
          >
            <svg
              width = "14"
              height = "14"
              fill = "none"
              stroke = "currentColor"
              viewBox = "0 0 24 24"
            >
              <path
                strokeLinecap = "round"
                strokeLinejoin = "round"
                strokeWidth = {2}
                d = "M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        { }
        <div style = {{ padding: "12px 20px 0" }}>
          <p className = "font-mono text-xs kalmus-text-muted">
            Job: {film.job_id}
          </p>
        </div>

        { }
        <div
          style = {{
            padding: "16px 20px 20px",
            display: "grid",
            gap: 14,
            flex: 1,
          }}
        >
          { }
          <div>
            <label
              className = {labelClass}
              style = {{ display: "block", marginBottom: 4 }}
            >
              Title
            </label>
            <input
              className = "kalmus-input"
              style = {inputBaseStyle}
              value = {title}
              onChange = {(e) => setTitle(e.target.value)} // updates state on every keystroke
            />
          </div>

          { }
          <div
            style = {{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                IMDb ID
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                value = {imdbId}
                onChange = {(e) => setImdbId(e.target.value)}
                placeholder = "tt0000000"
              />
            </div>
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                Released
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                value = {released}
                onChange = {(e) => setReleased(e.target.value)}
                placeholder = "YYYY-MM-DD"
              />
            </div>
          </div>

          { }
          <div
            style = {{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                Type
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                value = {type}
                onChange = {(e) => setType(e.target.value)}
                placeholder="movie, series, etc."
              />
            </div>
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                Runtime (minutes)
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                type = "number"
                value = {runtimeMinutes}
                onChange = {(e) => setRuntimeMinutes(e.target.value)}
              />
            </div>
          </div>

          { }
          <div
            style = {{
              height: 1,
              background: "var(--surface-border)",
              margin: "4px 0",
            }}
          />

          { }
          <p
            className = "font-mono text-xs tracking-[0.3em] uppercase kalmus-text-muted"
            style = {{ margin: 0 }}
          >
            ▸ Separate multiple values with commas
          </p>

          { }
          <div>
            <label
              className = {labelClass}
              style={{ display: "block", marginBottom: 4 }}
            >
              Director(s)
            </label>
            <input
              className = "kalmus-input"
              style = {inputBaseStyle}
              value = {directors}
              onChange = {(e) => setDirectors(e.target.value)}
              placeholder = "e.g. Christopher Nolan"
            />
          </div>

          { }
          <div>
            <label
              className = {labelClass}
              style = {{ display: "block", marginBottom: 4 }}
            >
              Actor(s)
            </label>
            <input
              className = "kalmus-input"
              style = {inputBaseStyle}
              value = {actors}
              onChange = {(e) => setActors(e.target.value)}
            />
          </div>

          { }
          <div>
            <label
              className = {labelClass}
              style = {{ display: "block", marginBottom: 4 }}
            >
              Genre(s)
            </label>
            <input
              className = "kalmus-input"
              style = {inputBaseStyle}
              value = {genres}
              onChange = {(e) => setGenres(e.target.value)}
            />
          </div>

          { }
          <div>
            <label
              className = {labelClass}
              style = {{ display: "block", marginBottom: 4 }}
            >
              Writer(s)
            </label>
            <input
              className = "kalmus-input"
              style = {inputBaseStyle}
              value = {writers}
              onChange = {(e) => setWriters(e.target.value)}
            />
          </div>

          { }
          <div
            style = {{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                Language(s)
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                value = {languages}
                onChange = {(e) => setLanguages(e.target.value)}
              />
            </div>
            { }
            <div>
              <label
                className = {labelClass}
                style = {{ display: "block", marginBottom: 4 }}
              >
                Country/Countries
              </label>
              <input
                className = "kalmus-input"
                style = {inputBaseStyle}
                value = {countries}
                onChange = {(e) => setCountries(e.target.value)}
              />
            </div>
          </div>
        </div>

        {}
        <div
          style = {{ //check page.tsx
            padding: "12px 20px",
            borderTop: "1px solid var(--surface-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "sticky",
            bottom: 0,
            background: "var(--panel-gradient, #0d0d10)",
          }}
        >
          { }
          <button
            onClick = {() => setConfirmDelete(true)}
            disabled = {deleting}
            className = "font-mono text-xs tracking-wider uppercase"
            style = {{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid var(--accent-crimson)",
              color: "var(--accent-crimson)",
              cursor: "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Delete
          </button>

          { }
          <div style = {{ flex: 1 }} />

          { }
          <button
            onClick = {onClose}
            className = "font-mono text-xs tracking-wider uppercase kalmus-text-muted"
            style = {{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid var(--surface-border)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          { }
          <button
            onClick = {handleSave}
            disabled = {saving || !title.trim()} // disabled if title is empty
            className = "font-mono text-xs tracking-wider uppercase"
            style = {{
              padding: "6px 14px",
              background: "var(--accent-amber)",
              color: "#000",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
              opacity: saving || !title.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}  { }
          </button>
        </div>
      </div>

      { }
      <style>{`
        @keyframes editPanelSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
