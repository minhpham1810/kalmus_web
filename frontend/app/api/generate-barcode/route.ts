import { NextRequest, NextResponse } from 'next/server';
import { submitSlurmJob, JobConfig } from '@/lib/slurm';
import { streamToHPC } from '@/lib/hpc-transfer';
import { findDuplicateAnalyses } from '@/lib/db';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

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
    const config: JobConfig = {
      color_metric: (formData.get('color_metric') as string) || 'Average',
      frame_type: (formData.get('frame_type') as string) || 'Whole_frame',
      barcode_type: (formData.get('barcode_type') as string) || 'Color',
      sampled_rate: parseInt((formData.get('sampled_rate') as string) || '1'),
      skip_over: parseInt((formData.get('skip_over') as string) || '0'),
      total_frames: parseInt((formData.get('total_frames') as string) || '100000000'),
      frames_per_column: parseInt((formData.get('frames_per_column') as string) || '192'),
      save_thumbnails: (formData.get('save_thumbnails') as string) !== 'false',
      partition: (formData.get('partition') as string) || 'short',
      email: (formData.get('email') as string) || undefined,
      force_reprocess: (formData.get('force_reprocess') as string) === 'true',
    };

    // Parse movie metadata (JSON-encoded form field)
    let movie: Record<string, unknown> | undefined;
    const movieRaw = formData.get('movie') as string | null;
    if (movieRaw) {
      try { movie = JSON.parse(movieRaw); } catch { /* ignore malformed */ }
    }

    const duplicateMatch = findDuplicateAnalyses(
      (movie?.imdb_id as string | undefined) || null,
      {
        barcode_type: config.barcode_type,
        frame_type: config.frame_type,
        color_metric: config.color_metric,
      }
    );

    if (duplicateMatch.exactMatch && !config.force_reprocess) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        existingJobId: duplicateMatch.exactMatch.job_id,
        existingAnalysis: duplicateMatch.exactMatch,
      });
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
    const result = await submitSlurmJob(videoPath, videoFile.name, config, user, movie);

    return NextResponse.json({
      success: true,
      message: 'Job submitted successfully',
      jobId: result.jobId,
      filename: videoFile.name,
      estimatedTime: result.estimatedTime,
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
