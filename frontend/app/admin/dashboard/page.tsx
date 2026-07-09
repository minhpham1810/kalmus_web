"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * One job row as returned by the /api/admin/jobs endpoint: a single analysis
 * joined with its film's metadata.
 */
interface Job {
  job_id: string;
  title: string | null;
  imdb_id: string | null;
  released: string | null;
  runtime_minutes: number | null;
  uploader: string | null;
  process_date: string | null;
  barcode_type: string | null;
  frame_type: string | null;
  metric: string | null;
  source_width: number | null;
  source_height: number | null;
  source_fps: number | null;
  source_frame_count: number | null;
  director: string | null;
  country: string | null;
}

type SortKey = "process_date" | "title" | "uploader" | "resolution";
type SortDir = "asc" | "desc";

/** Faint divider colour used for the table borders. Lower the alpha for fainter lines. */
const BORDER = "border-[rgba(128,128,128,0.12)]";

/**
 * dashboard page
 */
export default function AdminDashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("process_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");

  // load jobs
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/jobs");
        if (!res.ok) throw new Error("Failed to load jobs");
        const data = await res.json();
        if (!cancelled) setJobs(data.jobs ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "An error occurred");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "process_date" ? "desc" : "asc");
    }
  };

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = jobs;
    if (q) {
      list = jobs.filter(
        (j) =>
          (j.title ?? "").toLowerCase().includes(q) ||
          (j.uploader ?? "").toLowerCase().includes(q) ||
          (j.director ?? "").toLowerCase().includes(q),
      );
    }

    const sorted = [...list].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "title":
          av = (a.title ?? "").toLowerCase();
          bv = (b.title ?? "").toLowerCase();
          break;
        case "uploader":
          av = (a.uploader ?? "").toLowerCase();
          bv = (b.uploader ?? "").toLowerCase();
          break;
        case "resolution":
          av = (a.source_width ?? 0) * (a.source_height ?? 0);
          bv = (b.source_width ?? 0) * (b.source_height ?? 0);
          break;
        case "process_date":
        default:
          av = a.process_date ?? "";
          bv = b.process_date ?? "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [jobs, query, sortKey, sortDir]);

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Centered header, matching the main admin page */}
          <header className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <Link href="/admin" className="inline-block">
                <Image
                  src="/kalmus-logo.png"
                  alt="KALMUS"
                  width={300}
                  height={100}
                  className="dark:invert"
                  style={{ height: "auto" }}
                  priority
                />
              </Link>
            </div>
            <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary">
              Admin
            </p>
            <Link
              href="/admin"
              className="inline-flex items-center mt-3 font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="ml-1">Back</span>
            </Link>
          </header>

          {/* Filter box */}
          <div className="mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, uploader, or director…"
              className="kalmus-input w-full px-3 py-2 font-mono text-sm"
            />
          </div>

          {loading ? (
            <p className="font-mono text-sm kalmus-text-secondary py-12 text-center">
              Loading jobs
            </p>
          ) : error ? (
            <p
              className="font-mono text-sm py-12 text-center"
              style={{ color: "var(--text-primary)" }}
            >
              {error}
            </p>
          ) : filteredSorted.length === 0 ? (
            <p className="font-mono text-sm kalmus-text-secondary py-12 text-center">
              No jobs found.
            </p>
          ) : (
            <div className={`overflow-x-auto border ${BORDER} rounded`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${BORDER}`}>
                    <th
                      className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary cursor-pointer select-none"
                      onClick={() => handleSort("title")}
                    >
                      Film{sortIndicator("title")}
                    </th>
                    <th
                      className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary cursor-pointer select-none"
                      onClick={() => handleSort("uploader")}
                    >
                      Requested by{sortIndicator("uploader")}
                    </th>
                    <th
                      className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary cursor-pointer select-none"
                      onClick={() => handleSort("process_date")}
                    >
                      Date{sortIndicator("process_date")}
                    </th>
                    <th
                      className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary cursor-pointer select-none"
                      onClick={() => handleSort("resolution")}
                    >
                      Resolution{sortIndicator("resolution")}
                    </th>
                    <th className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
                      FPS
                    </th>
                    <th className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
                      Frames
                    </th>
                    <th className="text-left px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">
                      Analysis
                    </th>
                    <th className="text-right px-3 py-3 font-mono text-xs uppercase tracking-wider kalmus-text-secondary">

                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((j) => (
                    <tr
                      key={j.job_id}
                      className={`border-b ${BORDER} last:border-0 hover:bg-[var(--surface-hover,rgba(128,128,128,0.06))]`}
                    >
                      <td className="px-3 py-5 align-top">
                        <div className="font-mono kalmus-text-primary">
                          {j.title ?? "—"}
                        </div>
                        <div className="font-mono text-xs kalmus-text-secondary mt-0.5">
                          {[
                            j.director,
                            j.released ? new Date(j.released).getFullYear() : null,
                            j.country,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary">
                        {j.uploader ?? "—"}
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary whitespace-nowrap">
                        {j.process_date ?? "—"}
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary whitespace-nowrap">
                        {j.source_width && j.source_height
                          ? `${j.source_width} × ${j.source_height}`
                          : "—"}
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary">
                        {j.source_fps != null
                          ? Number(j.source_fps).toFixed(2)
                          : "—"}
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary">
                        {j.source_frame_count != null
                          ? j.source_frame_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-5 align-top font-mono text-xs kalmus-text-secondary capitalize">
                        {[
                          j.barcode_type,
                          j.frame_type?.replace(/_/g, " "),
                          j.metric,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </td>
                      <td className="px-3 py-5 align-top text-right whitespace-nowrap">
                        <Link
                          href={`/results/${j.job_id}?from=admin`}
                          className="font-mono text-xs uppercase tracking-wider kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 font-mono text-xs kalmus-text-muted text-center">
            {filteredSorted.length} job{filteredSorted.length === 1 ? "" : "s"}
            {query ? " matching filter" : ""}
          </p>
        </div>
      </main>
    </div>
  );
}