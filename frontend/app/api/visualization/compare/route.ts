import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { SLURM_CONFIG } from '@/lib/slurm';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId1 = searchParams.get('jobId1');
    const jobId2 = searchParams.get('jobId2');

    if (!jobId1 || !jobId2) {
      return NextResponse.json(
        { error: 'Both jobId1 and jobId2 are required' },
        { status: 400 }
      );
    }

    // Path to the comparison script
    const compareScript = path.join(process.cwd(), 'lib', 'kalmus_compare.py');

    // Execute the Python script to compare barcodes
    const { stdout, stderr } = await execAsync(
      `cd ${path.join(process.cwd(), 'lib')} && ` +
      `python3 ${compareScript} --job-id-1 ${jobId1} --job-id-2 ${jobId2} --results-dir ${SLURM_CONFIG.resultsDir}`
    );

    if (stderr && !stderr.includes('UserWarning')) {
      console.error('Python script error:', stderr);
    }

    // Parse the JSON output from the Python script
    const metrics = JSON.parse(stdout.trim());

    // Return the comparison metrics
    return NextResponse.json({
      success: true,
      metrics: metrics
    });

  } catch (error) {
    console.error('Error comparing barcodes:', error);
    return NextResponse.json(
      {
        error: 'Failed to compare barcodes',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
