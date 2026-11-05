import { NextRequest, NextResponse } from "next/server";

import { clientKey, isRateLimited } from "@/lib/rate-limit";
import { withRequestsDb } from "@/lib/requests";
import { normalizeEmail, subscribe } from "@/lib/requests-store";

export const dynamic = "force-dynamic";

/** Public: "remind me" — subscribe an email to an existing request. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimited(`remind:${clientKey(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests, try again shortly" }, { status: 429 });
  }

  try {
    const id = Number((await params).id);
    const email = normalizeEmail(((await request.json()) as { email?: unknown }).email);
    if (!Number.isInteger(id) || !email) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const result = withRequestsDb((db) => subscribe(db, id, email));
    if (!result) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error subscribing to request:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
