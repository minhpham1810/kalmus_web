import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const maxDuration = 600;
export const dynamic = 'force-dynamic';

const CHUNKS_DIR = '/tmp/kalmus-chunks';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        const chunk = formData.get('chunk') as File;
        const uploadId = formData.get('uploadId') as string;
        const chunkIndex = parseInt(formData.get('chunkIndex') as string);
        const totalChunks = parseInt(formData.get('totalChunks') as string);
        const filename = formData.get('filename') as string;

        if (!chunk || !uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !filename) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create chunks directory for this upload
        const uploadDir = path.join(CHUNKS_DIR, uploadId);
        await mkdir(uploadDir, { recursive: true });

        // Save chunk
        const chunkPath = path.join(uploadDir, `chunk_${chunkIndex.toString().padStart(6, '0')}`);
        const buffer = Buffer.from(await chunk.arrayBuffer());
        await writeFile(chunkPath, buffer);

        return NextResponse.json({
            success: true,
            message: `Chunk ${chunkIndex + 1}/${totalChunks} uploaded`,
            chunkIndex,
            totalChunks,
        });
    } catch (error) {
        console.error('Error uploading chunk:', error);
        return NextResponse.json(
            { error: 'Failed to upload chunk', details: (error as Error).message },
            { status: 500 }
        );
    }
}
