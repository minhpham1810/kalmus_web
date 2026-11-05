import { NextRequest, NextResponse } from "next/server";

import { updateRequestStatus } from "@/lib/requests";
import { getRequestById } from "@/lib/requests";
import { isRequestStatus } from "@/lib/requests-store";

export const dynamic = "force-dynamic";

/** Admin: one request with its saved configuration, used to prefill the upload form. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const found = Number.isInteger(id) ? getRequestById(id) : null;
    if (!found) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, request: found });
  } catch (error) {
    console.error("Error loading request:", error);
    return NextResponse.json({ error: "Failed to load request" }, { status: 500 });
  }
}

/** Admin: accept, reject or manually set a request's status; subscribers are emailed on accept/reject/complete. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = (await request.json()) as { status?: unknown; rejectReason?: unknown };
    if (!Number.isInteger(id) || !isRequestStatus(body.status)) {
      return NextResponse.json({ error: "Invalid request id or status" }, { status: 400 });
    }

    const rejectReason =
      typeof body.rejectReason === "string" ? body.rejectReason.slice(0, 500) : undefined;
    const updated = await updateRequestStatus(id, body.status, { rejectReason });
    if (!updated) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error("Error updating request:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
