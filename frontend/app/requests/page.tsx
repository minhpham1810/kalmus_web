"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import BarcodeGenerator from "@/app/components/BarcodeGenerator";
import RequestQueue, { QueueItem } from "@/app/components/requests/RequestQueue";

const POLL_MS = 10_000;
const EMAIL_KEY = "kalmus-request-email";

const NOTICES: Record<string, string> = {
  requested: "Request received. We'll email you as it progresses.",
  already: "You're already on the list for this request.",
  closed: "That request is already closed, so no reminder was set.",
};

function readSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* storage unavailable; the email just won't be remembered */
  }
}

function RequestsContent() {
  const notice = NOTICES[useSearchParams().get("notice") ?? ""];
  const [top, setTop] = useState<QueueItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [reminderMessage, setReminderMessage] = useState<{ text: string; isError: boolean } | null>(null);
  // Bumped after our own changes so the queue refreshes immediately instead of at the next poll
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Deferred so server and client first render match; the saved email fills in afterwards
    Promise.resolve().then(() => setEmail((current) => current || readSavedEmail()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/requests", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load requests");
        const data = (await res.json()) as { top: QueueItem[]; queue: QueueItem[] };
        if (cancelled) return;
        setTop(data.top);
        setQueue(data.queue);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Could not load the request queue. Retrying…");
      }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshKey]);

  async function remindMe(request: QueueItem) {
    setReminderMessage(null);
    try {
      const res = await fetch(`/api/requests/${request.id}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean; closed?: boolean };
      if (!res.ok) throw new Error(data.error || "Request failed");

      saveEmail(email);
      const text = data.closed
        ? NOTICES.closed
        : data.alreadySubscribed
          ? NOTICES.already
          : `We'll email ${email} about “${request.title}”.`;
      setReminderMessage({ text, isError: false });
      setRefreshKey((k) => k + 1);
    } catch (error) {
      setReminderMessage({ text: (error as Error).message, isError: true });
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <Link href="/" className="inline-block mb-3">
              <Image src="/kalmus-logo.png" alt="KALMUS" width={240} height={80} className="dark:invert" priority />
            </Link>
            <p className="text-sm kalmus-text-secondary font-mono tracking-wide">
              Request a film analysis. Choose your barcode settings below and an admin will review it.
            </p>
            <Link
              href="/"
              className="inline-flex items-center mt-3 font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="ml-1">Back to Archive</span>
            </Link>
          </header>

          {notice && (
            <p role="status" className="kalmus-surface font-mono text-xs kalmus-text-primary p-3 mb-6">
              {notice}
            </p>
          )}

          <section className="mb-10">
            <BarcodeGenerator mode="request" />
          </section>

          {loadError && <p className="font-mono text-xs kalmus-text-muted mb-4">{loadError}</p>}

          <section className="mb-8">
            <h2 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-3">▸ Most requested</h2>
            <RequestQueue ranked requests={top} emptyText="No requests yet — be the first." />
          </section>

          <section>
            <h2 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-3">▸ Request queue</h2>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email, for “Remind me”"
              aria-label="Email address for reminders"
              className="kalmus-input w-full px-3 py-2 font-mono text-xs mb-3"
            />
            {reminderMessage && (
              <p
                role={reminderMessage.isError ? "alert" : "status"}
                className="font-mono text-xs mb-3"
                style={{ color: reminderMessage.isError ? "var(--accent-crimson)" : "var(--text-primary)" }}
              >
                {reminderMessage.text}
              </p>
            )}
            <RequestQueue
              requests={queue}
              emptyText="The queue is empty."
              renderActions={(request) =>
                (request.status === "ordered" || request.status === "accepted" || request.status === "processing") && (
                  <button
                    onClick={() => remindMe(request)}
                    disabled={!emailValid}
                    title={emailValid ? "Email me when this changes" : "Enter your email above first"}
                    className="font-mono text-[11px] tracking-[0.18em] uppercase underline kalmus-text-secondary hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    Remind me
                  </button>
                )
              }
            />
          </section>
        </div>
      </main>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsContent />
    </Suspense>
  );
}
