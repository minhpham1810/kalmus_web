import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { SLURM_CONFIG } from '@/lib/slurm';

const execAsync = promisify(exec);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { searchParams } = new URL(request.url);
    const binStep = searchParams.get('binStep') || '1';

    // Path to the barcode JSON file
    const resultsDir = path.join(SLURM_CONFIG.resultsDir, jobId);
    const barcodeJsonPath = path.join(resultsDir, 'barcode.json');

    // Path to the visualization script
    const visualizerScript = path.join(process.cwd(), 'lib', 'kalmus_visualizer.py');

    // Execute the Python script to generate the histogram
    const { stdout, stderr } = await execAsync(
      `python3 ${visualizerScript} --job-id ${jobId} --type histogram --results-dir ${SLURM_CONFIG.resultsDir}`
    );

    if (stderr) {
      console.error('Python script error:', stderr);
    }

    // The script returns base64-encoded PNG
    const base64Image = stdout.trim();

    // Return the image as base64
    return NextResponse.json({
      success: true,
      image: base64Image,
      mimeType: 'image/png'
    });

  } catch (error) {
    console.error('Error generating hue histogram:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate hue histogram',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
