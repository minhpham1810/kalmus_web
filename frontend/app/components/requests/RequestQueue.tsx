import Link from "next/link";
import type { ReactNode } from "react";

import { describeAnalysis } from "@/lib/request-config";
import type { FilmRequest } from "@/lib/requests-store";
import StatusBadge from "./StatusBadge";

export type QueueItem = FilmRequest & { subscribers?: string[] };

interface RequestQueueProps {
  requests: QueueItem[];
  emptyText: string;
  /** Show a 1-based rank before each film (used for the top-10 list). */
  ranked?: boolean;
  renderActions?: (request: QueueItem) => ReactNode;
}

export default function RequestQueue({ requests, emptyText, ranked, renderActions }: RequestQueueProps) {
  if (requests.length === 0) {
    return <p className="font-mono text-xs kalmus-text-muted py-4">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {requests.map((request, index) => (
        <li key={request.id} className="kalmus-surface flex items-center gap-3 p-3">
          {ranked && (
            <span className="font-mono text-xs kalmus-text-muted w-5 text-right flex-shrink-0">{index + 1}</span>
          )}
          {request.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={request.posterUrl}
              alt=""
              className="w-10 flex-shrink-0"
              style={{ maxHeight: "60px", objectFit: "cover", border: "1px solid var(--surface-border)" }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs kalmus-text-primary truncate">
              {request.title}
              {request.year && <span className="kalmus-text-muted"> ({request.year})</span>}
            </p>
            <p className="font-mono text-[11px] kalmus-text-muted mt-0.5">
              {request.requestCount} {request.requestCount === 1 ? "request" : "requests"}
              {request.rejectReason && ` · ${request.rejectReason}`}
            </p>
            <p className="font-mono text-[11px] kalmus-text-muted mt-0.5">
              {request.config.analyses.map(describeAnalysis).join("  |  ")}
              {request.config.edition && ` · ${request.config.edition}`}
            </p>
            {request.subscribers && request.subscribers.length > 0 && (
              <p className="font-mono text-[11px] kalmus-text-muted mt-0.5 truncate" title={request.subscribers.join(", ")}>
                {request.subscribers.join(", ")}
              </p>
            )}
          </div>
          <StatusBadge status={request.status} />
          {request.status === "completed" && request.jobId && (
            <Link
              href={`/results/${request.jobId}`}
              className="font-mono text-[11px] tracking-[0.18em] uppercase underline kalmus-text-secondary hover:text-[var(--text-primary)]"
            >
              View
            </Link>
          )}
          {renderActions?.(request)}
        </li>
      ))}
    </ul>
  );
}
