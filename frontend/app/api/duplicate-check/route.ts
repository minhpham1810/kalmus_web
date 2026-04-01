import { NextRequest, NextResponse } from "next/server";
import { findDuplicateAnalyses } from "@/lib/db";

export async function GET(request: NextRequest) {
  const imdbId = request.nextUrl.searchParams.get("imdb_id");
  const barcodeType = request.nextUrl.searchParams.get("barcode_type");
  const frameType = request.nextUrl.searchParams.get("frame_type");
  const colorMetric = request.nextUrl.searchParams.get("color_metric");

  try {
    const duplicates = findDuplicateAnalyses(imdbId, {
      barcode_type: barcodeType,
      frame_type: frameType,
      color_metric: colorMetric,
    });

    return NextResponse.json({
      analyses: duplicates.analyses,
      exactMatches: duplicates.exactMatches,
      exactMatch: duplicates.exactMatch,
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
    return NextResponse.json(
      { error: "Failed to check for duplicate analyses" },
      { status: 500 }
    );
  }
}
