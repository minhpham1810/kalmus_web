import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, rm } from 'fs/promises';
import { createReadStream } from 'fs';
import { PassThrough } from 'stream';
import path from 'path';
import { submitSlurmJob, JobConfig } from '@/lib/slurm';
import { streamToHPC } from '@/lib/hpc-transfer';
import { findDuplicateAnalyses } from '@/lib/db';

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

        const jobConfig: JobConfig = {
            color_metric: config.color_metric || 'Average',
            frame_type: config.frame_type || 'Whole_frame',
            barcode_type: config.barcode_type || 'Color',
            sampled_rate: parseInt(config.sampled_rate) || 2,
            skip_over: parseInt(config.skip_over) || 0,
            total_frames: parseInt(config.total_frames) || 100000000,
            frames_per_column: parseInt(config.frames_per_column) || 50,
            save_thumbnails: config.save_thumbnails === 'true' || config.save_thumbnails === true,
            partition: config.partition || 'short',
            email: config.email || undefined,
            force_reprocess: config.force_reprocess === 'true' || config.force_reprocess === true,
        };

        const duplicateMatch = findDuplicateAnalyses(
            (movie?.imdb_id as string | undefined) || null,
            {
                barcode_type: jobConfig.barcode_type,
                frame_type: jobConfig.frame_type,
                color_metric: jobConfig.color_metric,
            }
        );

        if (duplicateMatch.exactMatch && !jobConfig.force_reprocess) {
            await rm(path.join(CHUNKS_DIR, uploadId), { recursive: true, force: true });

            return NextResponse.json({
                success: true,
                duplicate: true,
                existingJobId: duplicateMatch.exactMatch.id,
                existingAnalysis: duplicateMatch.exactMatch,
            });
        }

        // Get all chunks from /tmp
        const uploadDir = path.join(CHUNKS_DIR, uploadId);
        const chunkFiles = await readdir(uploadDir);

        // Sort chunks by index
        chunkFiles.sort((a, b) => {
            const aIndex = parseInt(a.replace('chunk_', ''));
            const bIndex = parseInt(b.replace('chunk_', ''));
            return aIndex - bIndex;
        });

        // Build the remote filename
        const timestamp = Date.now();
        const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const finalFilename = `${timestamp}_${sanitizedName}`;

        // Create a PassThrough that we feed chunks into; streamToHPC reads from it
        const passThrough = new PassThrough();

        // Start the HPC transfer (consumes the PassThrough stream)
        const transferPromise = streamToHPC(passThrough, finalFilename);

        // Feed each chunk into the PassThrough sequentially, deleting as we go
        (async () => {
            try {
                for (const chunkFile of chunkFiles) {
                    const chunkPath = path.join(uploadDir, chunkFile);
                    const readStream = createReadStream(chunkPath);

                    await new Promise<void>((resolve, reject) => {
                        readStream.on('end', async () => {
                            try {
                                await unlink(chunkPath);
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        });
                        readStream.on('error', reject);
                        readStream.pipe(passThrough, { end: false });
                    });
                }
                passThrough.end();
            } catch (err) {
                passThrough.destroy(err instanceof Error ? err : new Error(String(err)));
            }
        })();

        // Wait for the full transfer to complete
        const { remotePath: videoPath } = await transferPromise;

        // Clean up chunks directory
        try {
            await rm(uploadDir, { recursive: true, force: true });
        } catch (e) {
            console.warn('Could not remove upload directory:', e);
        }

        // Extract user info from headers
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
