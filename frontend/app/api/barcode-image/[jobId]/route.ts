import {NextRequest, NextResponse} from "next/server";
import {readFile} from "fs/promises";
import path from "path";

const RESULTS_DIR = "/home/kalmus/kalmus/results"

export async function GET(
  request: NextRequest,
  {params}: {params: Promise<{jobId: string}> }
) {
  const {jobId} = await params;

  // barcode validation
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return NextResponse.json({error: "Invalid job ID"}, {status: 400});
  }

  const filePath = path.join(RESULTS_DIR, jobId, "barcode.png");

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600", // cache save time
      },
    });
  } catch {
    return NextResponse.json({error: "Barcode not found"}, {status: 404});
  }
}