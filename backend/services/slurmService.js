import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

// Configuration from environment variables
const SLURM_SCRIPTS_DIR = process.env.SLURM_SCRIPTS_DIR || './slurm_scripts';
const RESULTS_DIR = process.env.RESULTS_DIR || './results';
const PYTHON_ENV = process.env.PYTHON_ENV || 'source ~/kalmus_env/bin/activate'; // Path to Python environment
const KALMUS_SCRIPT = process.env.KALMUS_SCRIPT || './kalmus_processor.py';

/**
 * Generate a SLURM job script for video processing
 */
function generateSlurmScript(jobId, videoPath, videoFilename, config) {
  const outputDir = path.join(RESULTS_DIR, jobId);
  const scriptPath = path.join(SLURM_SCRIPTS_DIR, `${jobId}.sh`);

  const script = `#!/bin/bash
#SBATCH --job-name=kalmus_${jobId.substring(0, 8)}
#SBATCH --partition=${config.partition}
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16GB
#SBATCH --time=01:00:00
#SBATCH --output=${outputDir}/slurm_%j.stdout.txt
#SBATCH --error=${outputDir}/slurm_%j.stderr.txt
${config.email ? `#SBATCH --mail-user=${config.email}` : ''}
${config.email ? '#SBATCH --mail-type=END,FAIL' : ''}

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
${PYTHON_ENV}

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
echo ""

python3 ${KALMUS_SCRIPT} \\
  --video-path "${videoPath}" \\
  --output-dir "${outputDir}" \\
  --color-metric "${config.color_metric}" \\
  --frame-type "${config.frame_type}" \\
  --barcode-type "${config.barcode_type}" \\
  --sampled-rate ${config.sampled_rate} \\
  --skip-over ${config.skip_over} \\
  --total-frames ${config.total_frames} \\
  --frames-per-column ${config.frames_per_column} \\
  --job-id "${jobId}"

EXIT_CODE=$?

echo ""
echo "Completed at: $(date)"
echo "Exit code: $EXIT_CODE"
echo "========================================="

# Create completion marker file
if [ $EXIT_CODE -eq 0 ]; then
  echo "SUCCESS" > ${outputDir}/status.txt
else
  echo "FAILED" > ${outputDir}/status.txt
fi

exit $EXIT_CODE
`;

  return { script, scriptPath, outputDir };
}

/**
 * Submit a SLURM job for video processing
 * @param {string} videoPath - Path to the video file
 * @param {string} videoFilename - Name of the video file
 * @param {object} config - Job configuration
 * @param {object} user - User information from authentication
 */
export async function submitJob(videoPath, videoFilename, config, user = null) {
  const jobId = uuidv4();

  try {
    // Ensure directories exist
    await fs.mkdir(SLURM_SCRIPTS_DIR, { recursive: true });
    await fs.mkdir(RESULTS_DIR, { recursive: true });

    // Generate SLURM script
    const { script, scriptPath, outputDir } = generateSlurmScript(
      jobId,
      videoPath,
      videoFilename,
      config
    );

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Write script to file
    await fs.writeFile(scriptPath, script, { mode: 0o755 });

    // Submit job using sbatch
    const { stdout, stderr } = await execAsync(`sbatch ${scriptPath}`);

    // Parse SLURM job ID from output (format: "Submitted batch job 12345")
    const slurmJobIdMatch = stdout.match(/Submitted batch job (\d+)/);
    const slurmJobId = slurmJobIdMatch ? slurmJobIdMatch[1] : null;

    if (!slurmJobId) {
      throw new Error(`Failed to parse SLURM job ID from output: ${stdout}`);
    }

    // Store job metadata
    const metadata = {
      jobId,
      slurmJobId,
      videoPath,
      videoFilename,
      config,
      submittedAt: new Date().toISOString(),
      status: 'PENDING',
      user: user ? {
        username: user.username,
        email: user.email,
        fullName: user.fullName
      } : null
    };

    await fs.writeFile(
      path.join(outputDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    console.log(`Job submitted: ${jobId} (SLURM ID: ${slurmJobId})`);

    // Try to get estimated start time (optional, may fail)
    let estimatedTime = null;
    try {
      const { stdout: testOutput } = await execAsync(`squeue -j ${slurmJobId} --format="%S" --noheader`);
      estimatedTime = testOutput.trim();
    } catch (e) {
      // Ignore errors getting estimated time
    }

    return {
      jobId,
      slurmJobId,
      estimatedTime
    };

  } catch (error) {
    console.error('Error submitting SLURM job:', error);
    throw new Error(`Failed to submit SLURM job: ${error.message}`);
  }
}

/**
 * Check the status of a SLURM job
 */
export async function checkJobStatus(jobId) {
  try {
    const outputDir = path.join(RESULTS_DIR, jobId);

    // Read metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    const slurmJobId = metadata.slurmJobId;

    // Check if job has completed by looking for status file
    try {
      const statusContent = await fs.readFile(path.join(outputDir, 'status.txt'), 'utf-8');
      const jobStatus = statusContent.trim();

      return {
        status: jobStatus,
        slurmJobId,
        submittedAt: metadata.submittedAt,
        completed: true
      };
    } catch (e) {
      // Status file doesn't exist yet, check SLURM queue
    }

    // Query SLURM for job status
    try {
      const { stdout } = await execAsync(
        `squeue -j ${slurmJobId} --format="%T|%M|%L|%r" --noheader`
      );

      if (stdout.trim()) {
        const [state, timeUsed, timeLeft, reason] = stdout.trim().split('|');

        return {
          status: state,
          slurmJobId,
          submittedAt: metadata.submittedAt,
          timeUsed,
          timeLeft,
          reason: reason !== 'None' ? reason : null,
          completed: false
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
            completed: state.includes('COMPLETED') || state.includes('FAILED')
          };
        }

        return {
          status: 'UNKNOWN',
          slurmJobId,
          submittedAt: metadata.submittedAt,
          completed: false
        };
      }
    } catch (error) {
      // Job might have completed, check for result files
      try {
        await fs.access(path.join(outputDir, 'barcode.json'));
        return {
          status: 'COMPLETED',
          slurmJobId,
          submittedAt: metadata.submittedAt,
          completed: true
        };
      } catch (e) {
        throw new Error(`Job ${jobId} not found in queue and no results available`);
      }
    }

  } catch (error) {
    console.error('Error checking job status:', error);
    throw new Error(`Failed to check job status: ${error.message}`);
  }
}

/**
 * Get the results of a completed job
 */
export async function getJobResult(jobId) {
  try {
    const outputDir = path.join(RESULTS_DIR, jobId);

    // Check if job is completed
    const statusPath = path.join(outputDir, 'status.txt');
    const statusContent = await fs.readFile(statusPath, 'utf-8');

    if (statusContent.trim() !== 'SUCCESS') {
      // Read error log
      const errorFiles = await fs.readdir(outputDir);
      const stderrFile = errorFiles.find(f => f.includes('stderr'));

      let errorMessage = 'Job failed';
      if (stderrFile) {
        errorMessage = await fs.readFile(path.join(outputDir, stderrFile), 'utf-8');
      }

      return {
        success: false,
        error: errorMessage
      };
    }

    // Read barcode result
    const barcodePath = path.join(outputDir, 'barcode.json');
    const barcodeContent = await fs.readFile(barcodePath, 'utf-8');
    const barcodeData = JSON.parse(barcodeContent);

    // Read metadata
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    return {
      success: true,
      message: 'Barcode generated successfully',
      barcode: barcodeData,
      download_filename: `barcode_${jobId}.json`,
      metadata: {
        ...metadata.config,
        submittedAt: metadata.submittedAt,
        videoFilename: metadata.videoFilename
      }
    };

  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // Result not ready yet
    }
    console.error('Error getting job result:', error);
    throw new Error(`Failed to get job result: ${error.message}`);
  }
}

/**
 * Cancel a SLURM job
 */
export async function cancelJob(jobId) {
  try {
    const outputDir = path.join(RESULTS_DIR, jobId);

    // Read metadata to get SLURM job ID
    const metadataPath = path.join(outputDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    const slurmJobId = metadata.slurmJobId;

    // Cancel the job
    await execAsync(`scancel ${slurmJobId}`);

    console.log(`Job cancelled: ${jobId} (SLURM ID: ${slurmJobId})`);

    return { success: true };

  } catch (error) {
    console.error('Error cancelling job:', error);
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
}
