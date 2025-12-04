import { NextRequest, NextResponse } from 'next/server';
import { submitSlurmJob, SLURM_CONFIG, JobConfig } from '@/lib/slurm';
import { mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// Configure route segment for large file uploads
export const maxDuration = 300; // 5 minutes timeout for large uploads

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

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
      sampled_rate: parseInt((formData.get('sampled_rate') as string) || '2'),
      skip_over: parseInt((formData.get('skip_over') as string) || '0'),
      total_frames: parseInt((formData.get('total_frames') as string) || '100000000'),
      frames_per_column: parseInt((formData.get('frames_per_column') as string) || '50'),
      partition: (formData.get('partition') as string) || 'short',
      email: (formData.get('email') as string) || undefined,
    };

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

    // Save video file to shared filesystem using streaming
    await mkdir(SLURM_CONFIG.uploadDir, { recursive: true });
    const timestamp = Date.now();
    const sanitizedName = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;
    const videoPath = path.join(SLURM_CONFIG.uploadDir, filename);

    // Stream the file to disk instead of loading into memory
    const fileStream = videoFile.stream();
    const nodeStream = Readable.fromWeb(fileStream as any);
    const writeStream = createWriteStream(videoPath);

    await pipeline(nodeStream, writeStream);

    // Submit SLURM job
    const result = await submitSlurmJob(videoPath, videoFile.name, config, user);

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
