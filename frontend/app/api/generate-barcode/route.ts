import { NextRequest, NextResponse } from 'next/server';
import { JobConfig } from '@/lib/slurm';
import { streamToHPC } from '@/lib/hpc-transfer';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { findDuplicateAnalysisSignatures, FRAME_TYPE_OPTIONS, parseAnalysisConfigPayload } from '@/lib/multi-analysis';
import { submitBarcodeBatch } from '@/lib/barcode-submission';

// Configure route segment for large file uploads
export const maxDuration = 600; // 10 minutes timeout for large uploads
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Parse formData with proper error handling for large files
    const formData = await request.formData().catch((error) => {
      console.error('FormData parsing error:', error);
      throw new Error('Failed to parse upload data. File may be too large or connection interrupted.');
    });

    // Get the video file
    const videoFile = formData.get('video') as File;
    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    // Extract configuration from form data
    const sharedConfig = {
      sampled_rate: parseInt((formData.get('sampled_rate') as string) || '1'),
      skip_over: parseInt((formData.get('skip_over') as string) || '0'),
      total_frames: parseInt((formData.get('total_frames') as string) || '100000000'),
      frames_per_column: parseInt((formData.get('frames_per_column') as string) || '192'),
      save_thumbnails: (formData.get('save_thumbnails') as string) !== 'false',
      partition: (formData.get('partition') as string) || 'short',
      email: (formData.get('email') as string) || undefined,
    } satisfies Omit<JobConfig, 'color_metric' | 'frame_type' | 'barcode_type'>;
    const analysisConfigs = parseAnalysisConfigPayload(
      (formData.get('analysis_configs') as string | null) || undefined,
    );
    const invalidFrameType = analysisConfigs.find(
      ({ frame_type }) => !FRAME_TYPE_OPTIONS.includes(frame_type as (typeof FRAME_TYPE_OPTIONS)[number]),
    );
    if (invalidFrameType) {
      return NextResponse.json(
        { error: `Invalid frame type: ${invalidFrameType.frame_type}` },
        { status: 400 }
      );
    }
    const duplicateSignatures = findDuplicateAnalysisSignatures(analysisConfigs);
    if (duplicateSignatures.length > 0) {
      return NextResponse.json(
        { error: 'Each batch option must be unique. Duplicate barcode type, frame type, and metric combination.' },
        { status: 400 }
      );
    }

    // Parse movie metadata (JSON-encoded form field)
    let movie: Record<string, unknown> | undefined;
    const movieRaw = formData.get('movie') as string | null;
    if (movieRaw) {
      try { movie = JSON.parse(movieRaw); } catch { /* ignore malformed */ }
    }
    // Extract user info from headers (if available from upstream auth)
    const username = request.headers.get('x-username');
    const email = request.headers.get('x-mail');
    const givenname = request.headers.get('x-givenname');
    const surname = request.headers.get('x-surname');

    const user = username ? {
      username,
      email: email || undefined,
      fullName: givenname && surname ? `${givenname} ${surname}` : username,
    } : undefined;

    // Stream video directly to HPC (no local disk write)
    const timestamp = Date.now();
    const sanitizedName = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;

    const nodeStream = Readable.fromWeb(
      videoFile.stream() as unknown as NodeReadableStream
    );
    const { remotePath: videoPath } = await streamToHPC(nodeStream, filename);

    // Submit SLURM job
    const batch = await submitBarcodeBatch({
      videoPath,
      videoFilename: videoFile.name,
      sharedConfig,
      analysisConfigs,
      user,
      movie,
    });

    return NextResponse.json({
      success: true,
      message: 'Jobs submitted successfully',
      batchId: batch.batchId,
      jobs: batch.jobs,
      filename: videoFile.name,
      createdAt: batch.createdAt,
    });
  } catch (error) {
    console.error('Error submitting SLURM job:', error);
    return NextResponse.json(
      {
        error: 'Failed to submit job',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
