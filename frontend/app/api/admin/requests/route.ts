import { NextResponse } from "next/server";

import { syncProcessingRequests, withRequestsDb } from "@/lib/requests";
import { FilmRequest, getSubscribers, listArchive, listQueue } from "@/lib/requests-store";

export const dynamic = "force-dynamic";

/** Admin: the queue with each request's subscriber emails. */
export async function GET() {
  try {
    await syncProcessingRequests();
    const { queue, archive } = withRequestsDb((db) => {
      const withSubscribers = (r: FilmRequest) => ({ ...r, subscribers: getSubscribers(db, r.id) });
      return { queue: listQueue(db).map(withSubscribers), archive: listArchive(db).map(withSubscribers) };
    });
    return NextResponse.json({ success: true, queue, archive });
  } catch (error) {
    console.error("Error loading admin requests:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}
