import { NextRequest, NextResponse } from 'next/server';
import { cancelSlurmJob } from '@/lib/slurm';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    await cancelSlurmJob(jobId);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully',
      jobId,
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel job',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
