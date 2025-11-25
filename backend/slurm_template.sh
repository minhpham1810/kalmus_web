#!/bin/bash
#SBATCH -p short                          # partition (max 1 day, suitable for video processing)
#SBATCH -N 1                              # single node
#SBATCH -n 4                              # 4 cores for video processing
#SBATCH --mem=16384                       # 16GB memory (adjust based on video size)
#SBATCH --job-name="kalmus_{{JOB_ID}}"    # job name with unique ID
#SBATCH -o {{OUTPUT_DIR}}/slurm.%j.stdout.txt    # STDOUT
#SBATCH -e {{OUTPUT_DIR}}/slurm.%j.stderr.txt    # STDERR
#SBATCH --mail-user={{USER_EMAIL}}        # email notifications
#SBATCH --mail-type=END,FAIL              # email on completion or failure

# Load required modules (if needed on your cluster)
# module load python/3.11
# module load ffmpeg

# Activate virtual environment
source {{VENV_PATH}}/bin/activate

# Set working directory
cd {{WORK_DIR}}

# Run the KALMUS processing script
python process_video.py \
    --video "{{VIDEO_PATH}}" \
    --output "{{OUTPUT_DIR}}" \
    --color-metric "{{COLOR_METRIC}}" \
    --frame-type "{{FRAME_TYPE}}" \
    --barcode-type "{{BARCODE_TYPE}}" \
    --sampled-rate {{SAMPLED_RATE}} \
    --skip-over {{SKIP_OVER}} \
    --total-frames {{TOTAL_FRAMES}} \
    --frames-per-column {{FRAMES_PER_COLUMN}}

# Mark job as complete
echo "COMPLETED" > {{OUTPUT_DIR}}/status.txt
