import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ThumbnailManifest } from '@/lib/barcode-utils';
import { hydrateBarcodeResult } from '@/lib/barcode-result';

const execAsync = promisify(exec);

// Configuration - these should match your HPC environment
export const SLURM_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR || '/shared/kalmus/uploads',
  resultsDir: process.env.RESULTS_DIR || '/shared/kalmus/results',
  scriptsDir: process.env.SCRIPTS_DIR || '/shared/kalmus/scripts',
  pythonEnv: process.env.PYTHON_ENV || 'source ~/kalmus_env/bin/activate',
  kalmusScript: process.env.KALMUS_SCRIPT || '/shared/kalmus/kalmus_processor.py',
  emailScript: process.env.EMAIL_SCRIPT || '/shared/kalmus/send_barcode_email.py',
  websiteUrl: process.env.WEBSITE_URL || 'http://localhost:3000',
};

export type NotificationStatus = 'COMPLETED' | 'FAILED' | 'DUPLICATE';

export interface JobConfig {
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  frames_per_column: number;
  save_thumbnails?: boolean;
  partition?: string;
  email?: string;
  video_title?: string;
  force_reprocess?: boolean;
}

export interface JobMetadata {
  jobId: string;
  slurmJobId: string;
  videoPath: string;
  videoFilename: string;
  config: JobConfig;
  submittedAt: string;
  status: string;
  user?: {
    username?: string;
    email?: string;
    fullName?: string;
  };
  movie?: Record<string, unknown>;
  estimatedTime?: string;
}

interface DuplicateMarker {
  existing_job_id: string;
  detected_at: string;
}

function normalizeEstimatedTime(value?: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  if (["n/a", "unknown", "none"].includes(normalized.toLowerCase())) {
    return undefined;
  }

  return normalized;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

// Conservative max frames processable within ~45 min per frame type.
// Derived from observed job timings: GrabCut ~1s/frame, watershed ~0.3s/frame.
const FRAME_TYPE_MAX_PROCESSABLE: Partial<Record<string, number>> = {
  foreground: 2500,
  background: 2500,
  high_contrast: 8000,
  low_contrast: 8000,
};

async function getVideoFrameCount(videoPath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 ${shellQuote(videoPath)}`
    );
    const frames = parseInt(stdout.trim(), 10);
    if (!isNaN(frames) && frames > 0) return frames;
  } catch { /* fall through to duration-based estimate */ }

  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,duration -of json ${shellQuote(videoPath)}`
    );
    const info = JSON.parse(stdout) as { streams?: { r_frame_rate?: string; duration?: string }[] };
    const stream = info.streams?.[0];
    if (stream?.duration && stream?.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/').map(Number);
      const fps = num / den;
      return Math.ceil(parseFloat(stream.duration) * fps);
    }
  } catch { /* ignore */ }

  return null;
}

function applyFrameTypeConstraints(config: JobConfig, actualFrameCount: number | null): JobConfig {
  let { total_frames, sampled_rate } = config;

  if (actualFrameCount !== null) {
    total_frames = Math.min(total_frames, actualFrameCount);

    const maxProcessable = FRAME_TYPE_MAX_PROCESSABLE[config.frame_type];
    if (maxProcessable !== undefined) {
      const minRate = Math.ceil(actualFrameCount / maxProcessable);
      sampled_rate = Math.max(sampled_rate, minRate);
    }
  }

  return { ...config, total_frames, sampled_rate };
}

export async function sendJobNotificationEmail({
  email,
  status,
  resultsUrl,
  videoTitle,
  metadataFile,
}: {
  email: string;
  status: NotificationStatus;
  resultsUrl: string;
  videoTitle: string;
  metadataFile?: string;
}): Promise<void> {
  const emailScript = shellQuote(SLURM_CONFIG.emailScript);
  const argList = [
    '--email',
    email,
    '--status',
    status,
    '--results-url',
    resultsUrl,
    '--video-title',
    videoTitle,
  ];
  if (metadataFile) {
    argList.push('--metadata-file', metadataFile);
  }
  const args = argList.map(shellQuote).join(' ');

  await execAsync(`python3 ${emailScript} ${args}`);
}

/**
 * Generate SLURM job script for video processing
 */
export function generateSlurmScript(
  jobId: string,
  videoPath: string,
  videoFilename: string,
  config: JobConfig
): string {
  const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);
  const partition = config.partition || 'short';
  const thumbnailArg = config.save_thumbnails !== false ? '  --save-thumbnails \\\n' : '';
  const forceReprocessArg = config.force_reprocess ? '  --force-reprocess \\\n' : '';
  const notificationScript = SLURM_CONFIG.emailScript;
  const notificationResultsUrl = `${SLURM_CONFIG.websiteUrl}/results/${jobId}`;
  const notificationTitle = config.video_title || videoFilename;

  return `#!/bin/bash
#SBATCH --job-name=kalmus_${jobId.substring(0, 8)}
#SBATCH --partition=${partition}
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16GB
#SBATCH --time=08:00:00
#SBATCH --output=${outputDir}/slurm_%j.stdout.txt
#SBATCH --error=${outputDir}/slurm_%j.stderr.txt

# Job information
echo "========================================="
echo "KALMUS Barcode Generation Job"
echo "========================================="
echo "Job ID: ${jobId}"
echo "SLURM Job ID: $SLURM_JOB_ID"
echo "Node: $SLURM_NODELIST"
echo "Started at: $(date)"
echo ""

# Create output directory
mkdir -p ${outputDir}

# Handle SIGTERM sent by SLURM when wall time is exceeded
timeout_handler() {
  echo ""
  echo "Job killed by SLURM time limit at: $(date)"
  echo "TIMEOUT" > ${outputDir}/status.txt
  if [ -n "${config.email}" ]; then
    python3 ${notificationScript} \\
      --email "${config.email}" \\
      --status "FAILED" \\
      --results-url "${notificationResultsUrl}" \\
      --video-title "${notificationTitle}" \\
      --metadata-file "${outputDir}/metadata.json" || true
  fi
  exit 1
}
trap timeout_handler SIGTERM

# Activate Python environment
${SLURM_CONFIG.pythonEnv}

# Set website URL for email links
export WEBSITE_URL="${SLURM_CONFIG.websiteUrl}"

# Run KALMUS processing
echo "Processing video: ${videoFilename}"
echo "Configuration:"
echo "  - Color Metric: ${config.color_metric}"
echo "  - Frame Type: ${config.frame_type}"
echo "  - Barcode Type: ${config.barcode_type}"
echo "  - Sampled Rate: ${config.sampled_rate}"
echo "  - Skip Over: ${config.skip_over}"
echo "  - Total Frames: ${config.total_frames}"
echo "  - Frames Per Column: ${config.frames_per_column}"
echo "  - Save Thumbnails: ${config.save_thumbnails !== false ? 'Yes' : 'No'}"
echo "  - Force Reprocess: ${config.force_reprocess ? 'Yes' : 'No'}"
echo ""

python3 ${SLURM_CONFIG.kalmusScript} \\
  --video-path "${videoPath}" \\
  --output-dir "${outputDir}" \\
  --color-metric "${config.color_metric}" \\
  --frame-type "${config.frame_type}" \\
  --barcode-type "${config.barcode_type}" \\
  --sampled-rate ${config.sampled_rate} \\
  --skip-over ${config.skip_over} \\
  --total-frames ${config.total_frames} \\
  --frames-per-column ${config.frames_per_column} \\
${thumbnailArg}${forceReprocessArg}  --job-id "${jobId}"

EXIT_CODE=$?

echo ""
echo "Completed at: $(date)"
echo "Exit code: $EXIT_CODE"
echo "========================================="

# Create completion marker file
if [ $EXIT_CODE -eq 0 ]; then
  if [ -f "${outputDir}/duplicate.json" ]; then
    DUPLICATE_JOB_ID=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["existing_job_id"])' "${outputDir}/duplicate.json")
    echo "DUPLICATE" > ${outputDir}/status.txt
  else
    echo "SUCCESS" > ${outputDir}/status.txt
  fi

  # Send notification email
  if [ -n "${config.email}" ]; then
    echo ""
    echo "Sending notification email to ${config.email}..."
    if [ -f "${outputDir}/duplicate.json" ]; then
      python3 ${notificationScript} \\
        --email "${config.email}" \\
        --status "DUPLICATE" \\
        --results-url "${SLURM_CONFIG.websiteUrl}/results/\${DUPLICATE_JOB_ID}" \\
        --video-title "${notificationTitle}" \\
        --metadata-file "${outputDir}/metadata.json"
    else
      python3 ${notificationScript} \\
        --email "${config.email}" \\
        --status "COMPLETED" \\
        --results-url "${notificationResultsUrl}" \\
        --video-title "${notificationTitle}" \\
        --metadata-file "${outputDir}/metadata.json"
    fi

    EMAIL_EXIT_CODE=$?
    if [ $EMAIL_EXIT_CODE -eq 0 ]; then
      echo "Notification email sent successfully!"
    else
      echo "Warning: Notification email failed (exit code: $EMAIL_EXIT_CODE)"
    fi
  fi
else
  echo "FAILED" > ${outputDir}/status.txt

  if [ -n "${config.email}" ]; then
    echo ""
    echo "Sending failure notification email to ${config.email}..."
    python3 ${notificationScript} \\
      --email "${config.email}" \\
      --status "FAILED" \\
      --results-url "${notificationResultsUrl}" \\
      --video-title "${notificationTitle}" \\
      --metadata-file "${outputDir}/metadata.json"

    EMAIL_EXIT_CODE=$?
    if [ $EMAIL_EXIT_CODE -eq 0 ]; then
      echo "Notification email sent successfully!"
    else
      echo "Warning: Notification email failed (exit code: $EMAIL_EXIT_CODE)"
    fi
  fi
fi

# Clean up uploaded video to free storage space
if [ -f "${videoPath}" ]; then
  rm -f "${videoPath}"
  echo "Cleaned up uploaded video: ${videoPath}"
fi

exit $EXIT_CODE
`;
}

/**
 * Submit a SLURM job
 */
export async function submitSlurmJob(
  videoPath: string,
  videoFilename: string,
  config: JobConfig,
  user?: { username?: string; email?: string; fullName?: string },
  movie?: Record<string, unknown>
): Promise<{ jobId: string; slurmJobId: string; estimatedTime?: string }> {
  const jobId = uuidv4();

  try {
    // Ensure directories exist
    await fs.mkdir(SLURM_CONFIG.scriptsDir, { recursive: true });
    await fs.mkdir(SLURM_CONFIG.resultsDir, { recursive: true });

    const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);
    await fs.mkdir(outputDir, { recursive: true });

    // Cap total_frames to actual video length and enforce per-frame-type sampled_rate floors
    const actualFrameCount = await getVideoFrameCount(videoPath);
    const effectiveConfig = applyFrameTypeConstraints(config, actualFrameCount);

    // Generate SLURM script
    const script = generateSlurmScript(jobId, videoPath, videoFilename, effectiveConfig);
    const scriptPath = path.join(SLURM_CONFIG.scriptsDir, `${jobId}.sh`);

    // Write script to file
    await fs.writeFile(scriptPath, script, { mode: 0o755 });

    // Submit job using sbatch
    const { stdout } = await execAsync(`sbatch ${scriptPath}`);

    // Parse SLURM job ID from output (format: "Submitted batch job 12345")
    const slurmJobIdMatch = stdout.match(/Submitted batch job (\d+)/);
    const slurmJobId = slurmJobIdMatch ? slurmJobIdMatch[1] : null;

    if (!slurmJobId) {
      throw new Error(`Failed to parse SLURM job ID from output: ${stdout}`);
    }

    // Try to get estimated start time (optional, may fail)
    let estimatedTime: string | undefined;
    try {
      const { stdout: timeOutput } = await execAsync(
        `squeue -j ${slurmJobId} --format="%S" --noheader`
      );
      estimatedTime = normalizeEstimatedTime(timeOutput);
    } catch {
      // Ignore errors getting estimated time
    }

    // Store job metadata
    const metadata: JobMetadata = {
      jobId,
      slurmJobId,
      videoPath,
      videoFilename,
      config: effectiveConfig,
      submittedAt: new Date().toISOString(),
      status: 'PENDING',
      user: user || undefined,
      movie: movie || undefined,
      estimatedTime,
    };

    await fs.writeFile(
      path.join(outputDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log(`Job submitted: ${jobId} (SLURM ID: ${slurmJobId})`);

    return { jobId, slurmJobId, estimatedTime };
  } catch (error) {
    console.error('Error submitting SLURM job:', error);
    throw new Error(`Failed to submit SLURM job: ${(error as Error).message}`);
  }
}

async function readDuplicateMarker(outputDir: string): Promise<DuplicateMarker | null> {
  try {
    const duplicateContent = await fs.readFile(
      path.join(outputDir, 'duplicate.json'),
      'utf-8'
    );
    return JSON.parse(duplicateContent) as DuplicateMarker;
  } catch {
    return null;
  }
}

/**
 * Check the status of a SLURM job
 */
export async function checkSlurmJobStatus(jobId: string) {
  try {
    const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);

    // Read metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: JobMetadata = JSON.parse(metadataContent);

    const slurmJobId = metadata.slurmJobId;

    // Check if job has completed by looking for status file
    try {
      const statusContent = await fs.readFile(
        path.join(outputDir, 'status.txt'),
        'utf-8'
      );
      const jobStatus = statusContent.trim();
      const duplicateMarker =
        jobStatus === 'DUPLICATE' ? await readDuplicateMarker(outputDir) : null;

      return {
        status: jobStatus,
        slurmJobId,
        submittedAt: metadata.submittedAt,
        completed: true,
        reused: jobStatus === 'DUPLICATE',
        existingJobId: duplicateMarker?.existing_job_id,
        estimatedTime: metadata.estimatedTime,
      };
    } catch {
      // Status file doesn't exist yet, check SLURM queue
    }

    // Query SLURM for job status
    try {
      const { stdout } = await execAsync(
        `squeue -j ${slurmJobId} --format="%T|%M|%L|%r|%S" --noheader`
      );

      if (stdout.trim()) {
        const [state, timeUsed, timeLeft, reason, estimatedStart] = stdout.trim().split('|');
        const estimatedTime =
          normalizeEstimatedTime(estimatedStart) || metadata.estimatedTime;

        return {
          status: state,
          slurmJobId,
          submittedAt: metadata.submittedAt,
          timeUsed,
          timeLeft,
          reason: reason !== 'None' ? reason : undefined,
          completed: false,
          estimatedTime,
        };
      } else {
        // Job not in queue anymore, check if it completed
        const { stdout: sacctOutput } = await execAsync(
          `sacct -j ${slurmJobId} --format=State,ExitCode --noheader --parsable2`
        );

        const lines = sacctOutput.trim().split('\n');
        if (lines.length > 0) {
          const [state, exitCode] = lines[0].split('|');

          return {
            status: state,
            exitCode,
            slurmJobId,
            submittedAt: metadata.submittedAt,
            completed: state.includes('COMPLETED') || state.includes('FAILED'),
            estimatedTime: metadata.estimatedTime,
          };
        }

        return {
          status: 'UNKNOWN',
          slurmJobId,
          submittedAt: metadata.submittedAt,
          completed: false,
          estimatedTime: metadata.estimatedTime,
        };
      }
    } catch {
      // Job might have completed, check for result files
      try {
        await fs.access(path.join(outputDir, 'barcode.json'));
        return {
          status: 'COMPLETED',
          slurmJobId,
          submittedAt: metadata.submittedAt,
          completed: true,
          estimatedTime: metadata.estimatedTime,
        };
      } catch {
        throw new Error(
          `Job ${jobId} not found in queue and no results available`
        );
      }
    }
  } catch (error) {
    console.error('Error checking job status:', error);
    throw new Error(
      `Failed to check job status: ${(error as Error).message}`
    );
  }
}

/**
 * Get the results of a completed job
 */
export async function getSlurmJobResult(jobId: string) {
  try {
    const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);

    // Check if job is completed
    const statusPath = path.join(outputDir, 'status.txt');
    const statusContent = await fs.readFile(statusPath, 'utf-8');

    if (statusContent.trim() !== 'SUCCESS') {
      if (statusContent.trim() === 'DUPLICATE') {
        const duplicateMarker = await readDuplicateMarker(outputDir);

        if (!duplicateMarker?.existing_job_id) {
          return {
            success: false,
            error: 'Equivalent analysis exists, but the existing result could not be resolved.',
          };
        }

        return {
          success: true,
          duplicate: true,
          existingJobId: duplicateMarker.existing_job_id,
          message: 'Equivalent analysis already exists',
        };
      }

      // Read error log
      const errorFiles = await fs.readdir(outputDir);
      const stderrFile = errorFiles.find((f) => f.includes('stderr'));

      let errorMessage = 'Job failed';
      if (stderrFile) {
        errorMessage = await fs.readFile(
          path.join(outputDir, stderrFile),
          'utf-8'
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Read metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: JobMetadata = JSON.parse(metadataContent);

    // Read barcode result
    const barcodePath = path.join(outputDir, 'barcode.json');
    const barcodeContent = await fs.readFile(barcodePath, 'utf-8');
    const rawBarcodeData = JSON.parse(barcodeContent) as Record<string, unknown>;
    const barcodeData = hydrateBarcodeResult(rawBarcodeData, metadata.config);

    // Read summary if available
    const summaryPath = path.join(outputDir, 'summary.json');
    let summaryData = null;
    try {
      const summaryContent = await fs.readFile(summaryPath, 'utf-8');
      summaryData = JSON.parse(summaryContent);
    } catch {
      // Summary file might not exist
    }

    let thumbnailData: ThumbnailManifest | null = null;
    try {
      const thumbnailsPath = path.join(outputDir, 'thumbnails.json');
      const thumbnailsContent = await fs.readFile(thumbnailsPath, 'utf-8');
      const parsedManifest = JSON.parse(thumbnailsContent) as ThumbnailManifest;
      thumbnailData = {
        ...parsedManifest,
        sheets: parsedManifest.sheets.map((sheet) => ({
          ...sheet,
          url: `/api/job-result/${jobId}/thumbnail-sheet/${sheet.index}`,
        })),
      };
    } catch {
      // Thumbnails are optional
    }

    return {
      success: true,
      message: 'Barcode generated successfully',
      barcode: barcodeData,
      summary: summaryData,
      thumbnails: thumbnailData,
      download_filename: `barcode_${jobId}.json`,
      metadata: {
        ...metadata.config,
        submittedAt: metadata.submittedAt,
        videoFilename: metadata.videoFilename,
        movie: metadata.movie,
      },
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // Result not ready yet
    }
    console.error('Error getting job result:', error);
    throw new Error(`Failed to get job result: ${(error as Error).message}`);
  }
}

/**
 * Cancel a SLURM job
 */
export async function cancelSlurmJob(jobId: string): Promise<void> {
  try {
    const outputDir = path.join(SLURM_CONFIG.resultsDir, jobId);

    // Read metadata to get SLURM job ID
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: JobMetadata = JSON.parse(metadataContent);

    const slurmJobId = metadata.slurmJobId;

    // Cancel the job
    await execAsync(`scancel ${slurmJobId}`);

    console.log(`Job cancelled: ${jobId} (SLURM ID: ${slurmJobId})`);
  } catch (error) {
    console.error('Error cancelling job:', error);
    throw new Error(`Failed to cancel job: ${(error as Error).message}`);
  }
}
