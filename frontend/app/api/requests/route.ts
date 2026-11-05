import { NextRequest, NextResponse } from "next/server";

import { clientKey, isRateLimited } from "@/lib/rate-limit";
import { syncProcessingRequests, withRequestsDb } from "@/lib/requests";
import { parseRequestConfig } from "@/lib/request-config";
import { addRequest, listQueue, listRequests, normalizeEmail, normalizeImdbId } from "@/lib/requests-store";

export const dynamic = "force-dynamic";

const TOP_COUNT = 10;
const MAX_TEXT = 300;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_TEXT) : null;
}

function cleanPoster(value: unknown): string | null {
  const url = cleanText(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Public: top requested films and the full queue (counts only, never subscriber emails). */
export async function GET() {
  try {
    await syncProcessingRequests();
    const { top, queue } = withRequestsDb((db) => ({
      top: listRequests(db, TOP_COUNT),
      queue: listQueue(db),
    }));
    return NextResponse.json({ success: true, top, queue });
  } catch (error) {
    console.error("Error loading requests:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}

/** Public: request a film (or join the existing request for it). */
export async function POST(request: NextRequest) {
  if (isRateLimited(`request:${clientKey(request)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      movie?: Record<string, unknown>;
      email?: unknown;
      config?: unknown;
    };
    const email = normalizeEmail(body.email);
    const imdbId = normalizeImdbId(body.movie?.imdb_id);
    const title = cleanText(body.movie?.title);
    const config = parseRequestConfig(body.config);

    if (!email) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }
    if (!imdbId || !title) {
      return NextResponse.json({ error: "Please pick a film from the search results" }, { status: 400 });
    }

    if (!config) {
      return NextResponse.json({ error: "Please choose at least one valid barcode configuration" }, { status: 400 });
    }

    const result = withRequestsDb((db) =>
      addRequest(
        db,
        { imdbId, title, year: cleanText(body.movie?.year), posterUrl: cleanPoster(body.movie?.poster_url) },
        config,
        email,
      ),
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error creating request:", error);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
