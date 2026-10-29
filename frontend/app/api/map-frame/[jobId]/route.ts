import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireEnv } from "@/lib/env";

const RESULTS_DIR = requireEnv("RESULTS_DIR");

// The film's dominant-hue frame, cropped by backend/film_map.py, for the map's hover card
export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }
  try {
    const file = await readFile(path.join(RESULTS_DIR, jobId, "map_frame.webp"));
    return new NextResponse(file, {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }
}
