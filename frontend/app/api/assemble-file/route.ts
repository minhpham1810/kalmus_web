import { NextRequest, NextResponse } from 'next/server';
import { readdir, unlink, rm } from 'fs/promises';
import { createReadStream } from 'fs';
import { PassThrough } from 'stream';
import path from 'path';
import { JobConfig } from '@/lib/slurm';
import { streamToHPC } from '@/lib/hpc-transfer';
import { findDuplicateAnalysisSignatures, FRAME_TYPE_OPTIONS, parseAnalysisConfigPayload } from '@/lib/multi-analysis';
import { submitBarcodeBatch } from '@/lib/barcode-submission';

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

        const sharedConfig = {
            sampled_rate: parseInt(config.sampled_rate) || 1,
            skip_over: parseInt(config.skip_over) || 0,
            total_frames: parseInt(config.total_frames) || 100000000,
            frames_per_column: parseInt(config.frames_per_column) || 192,
            save_thumbnails: config.save_thumbnails === undefined
                ? true
                : config.save_thumbnails === 'true' || config.save_thumbnails === true,
            partition: config.partition || 'short',
            email: config.email || undefined,
        } satisfies Omit<JobConfig, 'color_metric' | 'frame_type' | 'barcode_type'>;
        const analysisConfigs = parseAnalysisConfigPayload(config.analysis_configs);
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
        const batch = await submitBarcodeBatch({
            videoPath,
            videoFilename: filename,
            sharedConfig,
            analysisConfigs,
            user,
            movie: movie as Record<string, unknown> | undefined,
        });

        return NextResponse.json({
            success: true,
            message: 'Jobs submitted successfully',
            batchId: batch.batchId,
            jobs: batch.jobs,
            filename: filename,
            createdAt: batch.createdAt,
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
