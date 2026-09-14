import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const RESULTS_ROOT = "/home/kalmus/kalmus/results";

const CONTENT_TYPES: Record<string, string> = {
  ".dzi": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

// frame-scatter 6+ canvas zoom assets
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; path: string[] }> }
) {
  const { jobId, path: pathSegments } = await params;

  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const base_directory = path.join(RESULTS_ROOT, jobId, "frame-scatter");
  const requestedPath = path.join(base_directory, ...pathSegments);

  const resolvedBase = path.resolve(base_directory);
  const resolvedTarget = path.resolve(requestedPath);
  if (!resolvedTarget.startsWith(resolvedBase)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await stat(resolvedTarget);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(resolvedTarget).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const data = await readFile(resolvedTarget);
  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age = 3600",
    },
  });
}