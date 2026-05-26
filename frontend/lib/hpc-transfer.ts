/**
 * HPC Transfer Utility
 *
 * Streams a video file to the HPC upload directory without writing a
 * permanent copy on the web server's local disk.
 *
 * Strategy (in order):
 *  1. If HPC_HOST + HPC_USER are set, open an SSH2/SFTP connection first.
 *     If the connection succeeds, pipe the stream remotely.
 *     If the connection fails, log a warning and fall through to (2).
 *  2. Direct write to HPC_UPLOAD_DIR (NFS mount already accessible from
 *     the web server — typical when the web server is on the login node).
 *
 * The uploaded video is deleted by the SLURM job script once processing
 * finishes, so it never accumulates on disk.
 */

import { Readable } from 'stream';
import path from 'path';
import { copyFile, mkdir, rm } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export interface TransferResult {
  remotePath: string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

const HPC_CONFIG = {
  host: process.env.HPC_HOST,
  username: process.env.HPC_USER,
  privateKeyPath: process.env.HPC_KEY_PATH,
  // HPC_UPLOAD_DIR is the canonical upload path on the HPC.
  // Falls back to UPLOAD_DIR (NFS direct) for backward compatibility.
  uploadDir: process.env.HPC_UPLOAD_DIR || process.env.UPLOAD_DIR || '/shared/kalmus/uploads',
};

/**
 * Stream a readable into the HPC upload directory.
 * Returns the absolute path the file landed at (used as --video-path in SLURM).
 */
export async function streamToHPC(
  readable: Readable,
  filename: string
): Promise<TransferResult> {
  const targetPath = path.join(HPC_CONFIG.uploadDir, filename);

  if (HPC_CONFIG.host && HPC_CONFIG.username) {
    // Establish SSH connection BEFORE touching the stream so we can fall
    // back gracefully if the connection fails.
    const conn = await tryConnectSSH();
    if (conn) {
      try {
        return await streamViaSFTP(conn, readable, targetPath);
      } catch (err) {
        console.error('SFTP transfer failed:', (err as Error).message);
        throw err; // SFTP started but failed mid-stream — don't silently corrupt
      }
    }
    // Connection attempt failed — fall through to direct write
  }

  return streamDirect(readable, targetPath);
}

export function buildClonedUploadPath(sourcePath: string, suffix: string): string {
  const parsed = path.parse(sourcePath);
  return path.join(parsed.dir, `${parsed.name}__${suffix}${parsed.ext}`);
}

export async function cloneUploadedVideo(
  sourcePath: string,
  targetPath: string,
): Promise<TransferResult> {
  if (HPC_CONFIG.host && HPC_CONFIG.username) {
    const conn = await tryConnectSSH();
    if (conn) {
      try {
        return await copyViaSSH(conn, sourcePath, targetPath);
      } catch (err) {
        console.error('SFTP copy failed:', (err as Error).message);
        throw err;
      }
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  return { remotePath: targetPath };
}

// ─── SSH connection attempt ──────────────────────────────────────────────────

type SSH2Client = import('ssh2').Client;

async function tryConnectSSH(): Promise<SSH2Client | null> {
  try {
    const { Client } = await import('ssh2');
    const { readFile } = await import('fs/promises');

    const privateKey = HPC_CONFIG.privateKeyPath
      ? await readFile(HPC_CONFIG.privateKeyPath).catch((err) => {
          console.warn(`HPC_KEY_PATH not readable (${HPC_CONFIG.privateKeyPath}): ${err.message}`);
          return undefined;
        })
      : undefined;

    return await new Promise<SSH2Client>((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => resolve(conn));

      conn.on('error', (err) => {
        reject(new Error(`SSH connect error (${HPC_CONFIG.host}): ${err.message}`));
      });

      conn.connect({
        host: HPC_CONFIG.host!,
        port: 22,
        username: HPC_CONFIG.username!,
        privateKey,
        readyTimeout: 10000, // 10 s — fail fast so upload doesn't stall
      });
    });
  } catch (err) {
    console.warn(
      `SFTP unavailable, falling back to NFS direct write: ${(err as Error).message}`
    );
    return null;
  }
}

// ─── SFTP write ──────────────────────────────────────────────────────────────

async function streamViaSFTP(
  conn: SSH2Client,
  readable: Readable,
  remotePath: string
): Promise<TransferResult> {
  return new Promise<TransferResult>((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(new Error(`SFTP session error: ${err.message}`));
      }

      const remoteDir = path.dirname(remotePath);
      // mkdir is best-effort; directory may already exist
      sftp.mkdir(remoteDir, { mode: 0o755 }, () => {
        const writeStream = sftp.createWriteStream(remotePath);

        writeStream.on('close', () => {
          conn.end();
          resolve({ remotePath });
        });

        writeStream.on('error', (writeErr: Error) => {
          conn.end();
          reject(new Error(`SFTP write error: ${writeErr.message}`));
        });

        readable.on('error', (readErr) => {
          conn.end();
          reject(new Error(`Read stream error: ${readErr.message}`));
        });

        readable.pipe(writeStream);
      });
    });
  });
}

async function copyViaSSH(
  conn: SSH2Client,
  sourcePath: string,
  targetPath: string,
): Promise<TransferResult> {
  const remoteDir = path.dirname(targetPath);
  const command = `mkdir -p ${shellQuote(remoteDir)} && cp ${shellQuote(sourcePath)} ${shellQuote(targetPath)}`;

  return new Promise<TransferResult>((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        conn.end();
        reject(new Error(`SSH copy error: ${err.message}`));
        return;
      }

      let stderr = "";

      stream.on("close", (code: number) => {
        conn.end();
        if (code === 0) {
          resolve({ remotePath: targetPath });
          return;
        }

        reject(new Error(`SSH copy failed (${code}): ${stderr.trim()}`));
      });

      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    });
  });
}

// ─── Direct write (NFS / local) ─────────────────────────────────────────────

async function streamDirect(
  readable: Readable,
  targetPath: string
): Promise<TransferResult> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const writeStream = createWriteStream(targetPath);
  await pipeline(readable, writeStream);
  return { remotePath: targetPath };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Delete a video file from the upload directory.
 * Best-effort; errors are swallowed. The SLURM script also performs this
 * cleanup, so this is a secondary safety net.
 */
export async function deleteUploadedVideo(videoPath: string): Promise<void> {
  if (!videoPath) return;

  const resolvedPath = path.resolve(videoPath);
  const resolvedUploadDir = path.resolve(HPC_CONFIG.uploadDir);

  if (!resolvedPath.startsWith(resolvedUploadDir)) {
    console.warn(`deleteUploadedVideo: ${videoPath} is outside upload dir, skipping`);
    return;
  }

  try {
    await rm(resolvedPath, { force: true });
    console.log(`Deleted uploaded video: ${videoPath}`);
  } catch (err) {
    console.warn(`Could not delete uploaded video ${videoPath}:`, err);
  }
}
