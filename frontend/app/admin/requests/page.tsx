"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import RequestQueue, { QueueItem } from "@/app/components/requests/RequestQueue";
import { REQUEST_STATUSES, RequestStatus } from "@/lib/requests-store";
import { statusLabel } from "@/app/components/requests/StatusBadge";

const POLL_MS = 10_000;
const actionClass =
  "font-mono text-[11px] tracking-[0.18em] uppercase underline kalmus-text-secondary hover:text-[var(--text-primary)]";

export default function AdminRequestsPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Bumped after our own changes so the queue refreshes immediately instead of at the next poll
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/admin/requests", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load requests");
        const data = (await res.json()) as { queue: QueueItem[] };
        if (!cancelled) setQueue(data.queue);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);

  async function update(request: QueueItem, status: RequestStatus, rejectReason?: string) {
    setBusyId(request.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectReason }),
      });
      if (!res.ok) {
        throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Update failed");
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function reject(request: QueueItem) {
    const reason = window.prompt(`Reason for declining “${request.title}” (included in the email, optional):`);
    if (reason !== null) update(request, "rejected", reason);
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <Link
              href="/admin"
              className="inline-flex items-center font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="ml-1">Back to Admin</span>
            </Link>
            <h1 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mt-4">▸ Film requests</h1>
            <p className="font-mono text-xs kalmus-text-muted mt-2">
              Accepting emails subscribers. Then use &quot;Upload video&quot; to open the upload form with the requester&apos;s settings filled in and attach the video. Submitting the job
              moves the request to processing, and subscribers are emailed when it completes.
            </p>
          </header>

          {error && (
            <p role="alert" className="font-mono text-xs mb-4" style={{ color: "var(--accent-crimson)" }}>
              {error}
            </p>
          )}

          <RequestQueue
            ranked
            requests={queue}
            emptyText="No requests yet."
            renderActions={(request) => {
              const busy = busyId === request.id;
              return (
                <div className="flex items-center gap-3 flex-shrink-0">
                  {request.status === "ordered" && (
                    <>
                      <button disabled={busy} className={actionClass} onClick={() => update(request, "accepted")}>
                        Accept
                      </button>
                      <button disabled={busy} className={actionClass} onClick={() => reject(request)}>
                        Reject
                      </button>
                    </>
                  )}
                  {(request.status === "accepted" || request.status === "processing") && (
                    <Link
                      href={`/upload?from=admin&request=${request.id}`}
                      className={actionClass}
                    >
                      {request.status === "accepted" ? "Upload video" : "Re-run"}
                    </Link>
                  )}
                  <select
                    aria-label={`Set status for ${request.title}`}
                    value={request.status}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value as RequestStatus;
                      if (next === "rejected") reject(request);
                      else update(request, next);
                    }}
                    className="kalmus-input font-mono text-[11px] px-1 py-0.5"
                  >
                    {REQUEST_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }}
          />
        </div>
      </main>
    </div>
  );
}
