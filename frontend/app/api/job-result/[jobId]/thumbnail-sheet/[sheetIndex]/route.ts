import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SLURM_CONFIG } from '@/lib/slurm';

interface ThumbnailManifest {
  sheets?: Array<{
    index: number;
    filename: string;
  }>;
}

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string; sheetIndex: string }> }
) {
  try {
    const { jobId, sheetIndex } = await params;
    const parsedSheetIndex = Number.parseInt(sheetIndex, 10);

    if (!Number.isInteger(parsedSheetIndex) || parsedSheetIndex < 0) {
      return NextResponse.json({ error: 'Invalid sheet index' }, { status: 400 });
    }

    const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);
    const manifestPath = path.join(outputDir, 'thumbnails.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as ThumbnailManifest;
    const sheet = manifest.sheets?.find((entry) => entry.index === parsedSheetIndex);

    if (!sheet) {
      return NextResponse.json({ error: 'Thumbnail sheet not found' }, { status: 404 });
    }

    const sheetPath = path.join(outputDir, sheet.filename);
    const imageBuffer = await fs.readFile(sheetPath);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Thumbnail sheet not found' }, { status: 404 });
    }

    console.error('Error serving thumbnail sheet:', error);
    return NextResponse.json(
      {
        error: 'Failed to load thumbnail sheet',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
