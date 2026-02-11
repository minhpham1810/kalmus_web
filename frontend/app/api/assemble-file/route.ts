import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, rmdir } from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { submitSlurmJob, SLURM_CONFIG, JobConfig } from '@/lib/slurm';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

const CHUNKS_DIR = '/tmp/kalmus-chunks';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { uploadId, filename, config, movie } = body;

        if (!uploadId || !filename || !config) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Get all chunks
        const uploadDir = path.join(CHUNKS_DIR, uploadId);
        const chunkFiles = await readdir(uploadDir);

        // Sort chunks by index
        chunkFiles.sort((a, b) => {
            const aIndex = parseInt(a.replace('chunk_', ''));
            const bIndex = parseInt(b.replace('chunk_', ''));
            return aIndex - bIndex;
        });

        // Prepare final file path
        await mkdir(SLURM_CONFIG.uploadDir, { recursive: true });
        const timestamp = Date.now();
        const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalFilename = `${timestamp}_${sanitizedName}`;
        const videoPath = path.join(SLURM_CONFIG.uploadDir, finalFilename);

        // Assemble chunks into final file using streaming
        const writeStream = createWriteStream(videoPath);

        for (const chunkFile of chunkFiles) {
            const chunkPath = path.join(uploadDir, chunkFile);
            const readStream = createReadStream(chunkPath);

            // Stream chunk to output without loading into memory
            await new Promise<void>((resolve, reject) => {
                readStream.pipe(writeStream, { end: false });
                readStream.on('end', async () => {
                    try {
                        await unlink(chunkPath); // Delete chunk after streaming
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
                readStream.on('error', reject);
            });
        }

        // Close the write stream
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Clean up chunks directory
        try {
            await rmdir(uploadDir);
        } catch (e) {
            console.warn('Could not remove upload directory:', e);
        }

        // Parse config
        const jobConfig: JobConfig = {
            color_metric: config.color_metric || 'Average',
            frame_type: config.frame_type || 'Whole_frame',
            barcode_type: config.barcode_type || 'Color',
            sampled_rate: parseInt(config.sampled_rate) || 2,
            skip_over: parseInt(config.skip_over) || 0,
            total_frames: parseInt(config.total_frames) || 100000000,
            frames_per_column: parseInt(config.frames_per_column) || 50,
            partition: config.partition || 'short',
            email: config.email || undefined,
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

        // Submit SLURM job
        const result = await submitSlurmJob(videoPath, filename, jobConfig, user, movie as Record<string, unknown> | undefined);

        return NextResponse.json({
            success: true,
            message: 'Job submitted successfully',
            jobId: result.jobId,
            filename: filename,
            estimatedTime: result.estimatedTime,
        });
    } catch (error) {
        console.error('Error assembling file and submitting job:', error);
        return NextResponse.json(
            {
                error: 'Failed to assemble file and submit job',
                details: (error as Error).message
            },
            { status: 500 }
        );
    }
}
