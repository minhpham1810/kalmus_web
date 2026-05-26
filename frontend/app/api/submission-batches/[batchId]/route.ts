import { NextResponse } from "next/server";

import { getSubmissionBatch } from "@/lib/submission-batches";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  void request;

  try {
    const { batchId } = await params;
    const batch = await getSubmissionBatch(batchId);

    if (!batch) {
      return NextResponse.json(
        { error: "Submission batch not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      batch,
    });
  } catch (error) {
    console.error("Error loading submission batch:", error);
    return NextResponse.json(
      {
        error: "Failed to load submission batch",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
