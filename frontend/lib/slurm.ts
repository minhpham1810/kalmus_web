import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ThumbnailManifest } from '@/lib/barcode-utils';

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
  const emailDirectives = config.email
    ? `#SBATCH --mail-user=${config.email}
#SBATCH --mail-type=END,FAIL`
    : '';
  const thumbnailArg = config.save_thumbnails ? '  --save-thumbnails \\\n' : '';
  const forceReprocessArg = config.force_reprocess ? '  --force-reprocess \\\n' : '';

  return `#!/bin/bash
#SBATCH --job-name=kalmus_${jobId.substring(0, 8)}
#SBATCH --partition=${partition}
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16GB
#SBATCH --time=01:00:00
#SBATCH --output=${outputDir}/slurm_%j.stdout.txt
#SBATCH --error=${outputDir}/slurm_%j.stderr.txt
${emailDirectives}

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
echo "  - Save Thumbnails: ${config.save_thumbnails ? 'Yes' : 'No'}"
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
    echo "DUPLICATE" > ${outputDir}/status.txt
  else
    echo "SUCCESS" > ${outputDir}/status.txt
  fi

  # Send email with barcode attachments
  if [ -n "${config.email}" ] && [ ! -f "${outputDir}/duplicate.json" ]; then
    echo ""
    echo "Sending barcode via email to ${config.email}..."
    python3 ${SLURM_CONFIG.emailScript} \\
      --email "${config.email}" \\
      --job-id "${jobId}" \\
      --results-dir "${outputDir}" \\
      --video-filename "${videoFilename}"

    EMAIL_EXIT_CODE=$?
    if [ $EMAIL_EXIT_CODE -eq 0 ]; then
      echo "Email sent successfully!"
    else
      echo "Warning: Email sending failed (exit code: $EMAIL_EXIT_CODE)"
    fi
  fi
else
  echo "FAILED" > ${outputDir}/status.txt
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

    // Generate SLURM script
    const script = generateSlurmScript(jobId, videoPath, videoFilename, config);
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
      config,
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

    // Read barcode result
    const barcodePath = path.join(outputDir, 'barcode.json');
    const barcodeContent = await fs.readFile(barcodePath, 'utf-8');
    const barcodeData = JSON.parse(barcodeContent);

    // Read summary if available
    const summaryPath = path.join(outputDir, 'summary.json');
    let summaryData = null;
    try {
      const summaryContent = await fs.readFile(summaryPath, 'utf-8');
      summaryData = JSON.parse(summaryContent);
    } catch {
      // Summary file might not exist
    }

    // Read metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: JobMetadata = JSON.parse(metadataContent);

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
