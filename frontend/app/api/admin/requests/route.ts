import { NextResponse } from "next/server";

import { syncProcessingRequests, withRequestsDb } from "@/lib/requests";
import { getSubscribers, listQueue } from "@/lib/requests-store";

export const dynamic = "force-dynamic";

/** Admin: the queue with each request's subscriber emails. */
export async function GET() {
  try {
    await syncProcessingRequests();
    const queue = withRequestsDb((db) =>
      listQueue(db).map((r) => ({ ...r, subscribers: getSubscribers(db, r.id) })),
    );
    return NextResponse.json({ success: true, queue });
  } catch (error) {
    console.error("Error loading admin requests:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}
