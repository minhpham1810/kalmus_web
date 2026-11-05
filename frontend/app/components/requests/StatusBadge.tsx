import type { RequestStatus } from "@/lib/requests-store";

const LABELS: Record<RequestStatus, string> = {
  ordered: "Ordered",
  accepted: "Accepted",
  processing: "Processing",
  completed: "Completed",
  rejected: "Declined",
};

// The palette is monochrome, so status is carried by fill, border and weight rather than hue.
const STYLES: Record<RequestStatus, React.CSSProperties> = {
  ordered: { border: "1px dashed var(--input-border)", color: "var(--text-muted)" },
  accepted: { border: "1px solid var(--input-border)", color: "var(--text-primary)" },
  processing: { border: "1px solid var(--foreground)", color: "var(--text-primary)", fontWeight: 700 },
  completed: { background: "var(--foreground)", color: "var(--background)", border: "1px solid var(--foreground)" },
  rejected: { border: "1px solid var(--surface-border)", color: "var(--text-muted)", textDecoration: "line-through" },
};

export function statusLabel(status: RequestStatus): string {
  return LABELS[status];
}

export default function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className="font-mono text-[10px] tracking-[0.18em] uppercase px-2 py-0.5 whitespace-nowrap"
      style={STYLES[status]}
    >
      {LABELS[status]}
    </span>
  );
}
