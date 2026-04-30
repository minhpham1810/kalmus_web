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
    const start1 = searchParams.get('start1');
    const end1 = searchParams.get('end1');
    const start2 = searchParams.get('start2');
    const end2 = searchParams.get('end2');

    if (!jobId1 || !jobId2) {
      return NextResponse.json(
        { error: 'Both jobId1 and jobId2 are required' },
        { status: 400 }
      );
    }

    const parseOptionalRange = (
      startValue: string | null,
      endValue: string | null,
      label: string
    ) => {
      if (startValue === null && endValue === null) {
        return null;
      }

      if (startValue === null || endValue === null) {
        throw new Error(`Both ${label} start and end values are required`);
      }

      const start = Number.parseInt(startValue, 10);
      const end = Number.parseInt(endValue, 10);

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid ${label} range values`);
      }

      return { start, end };
    };

    let range1: { start: number; end: number } | null;
    let range2: { start: number; end: number } | null;

    try {
      range1 = parseOptionalRange(start1, end1, 'barcode 1');
      range2 = parseOptionalRange(start2, end2, 'barcode 2');
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }

    // Path to the comparison script
    const compareScript = path.join(process.cwd(), 'lib', 'kalmus_compare.py');

    const rangeArgs = [
      range1 ? ` --start-1 ${range1.start} --end-1 ${range1.end}` : '',
      range2 ? ` --start-2 ${range2.start} --end-2 ${range2.end}` : '',
    ].join('');

    // Execute the Python script to compare barcodes
    const { stdout, stderr } = await execAsync(
      `cd ${path.join(process.cwd(), 'lib')} && ` +
      `python3 ${compareScript} --job-id-1 ${jobId1} --job-id-2 ${jobId2} --results-dir ${SLURM_CONFIG.resultsDir}${rangeArgs}`
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
