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
    const sampling = searchParams.get('sampling') || '3000';

    // Path to the visualization script
    const visualizerScript = path.join(process.cwd(), 'lib', 'kalmus_visualizer.py');

    // Execute the Python script to generate the RGB cube
    const { stdout, stderr } = await execAsync(
      `python3 ${visualizerScript} --job-id ${jobId} --type cube --results-dir ${SLURM_CONFIG.resultsDir}`
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
    console.error('Error generating RGB cube:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate RGB cube visualization',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
