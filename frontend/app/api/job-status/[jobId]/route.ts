import { NextRequest, NextResponse } from 'next/server';
import { checkSlurmJobStatus } from '@/lib/slurm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const status = await checkSlurmJobStatus(jobId);

    return NextResponse.json({
      success: true,
      jobId,
      ...status,
    });
  } catch (error) {
    console.error('Error checking job status:', error);
    return NextResponse.json(
      {
        error: 'Failed to check job status',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
