import { NextRequest, NextResponse } from 'next/server';
import { getSlurmJobResult } from '@/lib/slurm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const result = await getSlurmJobResult(jobId);

    if (!result) {
      return NextResponse.json(
        { error: 'Result not found or job not completed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId,
      ...result,
    });
  } catch (error) {
    console.error('Error getting job result:', error);
    return NextResponse.json(
      {
        error: 'Failed to get job result',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
