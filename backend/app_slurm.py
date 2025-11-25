from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import subprocess
import uuid
from pathlib import Path
from datetime import datetime
import re

app = Flask(__name__)
CORS(app)

# Configuration - MODIFY THESE FOR YOUR UNIVERSITY SETUP
WORK_DIR = os.getenv('KALMUS_WORK_DIR', '/home/yourusername/kalmus_jobs')  # Shared filesystem path
VENV_PATH = os.getenv('KALMUS_VENV_PATH', '/home/yourusername/kalmus_venv')  # Python venv on cluster
USER_EMAIL = os.getenv('KALMUS_USER_EMAIL', 'your.email@bucknell.edu')  # For SLURM notifications
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Create work directory if it doesn't exist
Path(WORK_DIR).mkdir(parents=True, exist_ok=True)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_slurm_script(job_id, video_path, output_dir, config):
    """Generate a SLURM batch script from template"""
    template_path = Path(__file__).parent / 'slurm_template.sh'
    
    with open(template_path, 'r') as f:
        template = f.read()
    
    # Replace placeholders
    script = template.replace('{{JOB_ID}}', job_id)
    script = script.replace('{{OUTPUT_DIR}}', output_dir)
    script = script.replace('{{USER_EMAIL}}', USER_EMAIL)
    script = script.replace('{{VENV_PATH}}', VENV_PATH)
    script = script.replace('{{WORK_DIR}}', WORK_DIR)
    script = script.replace('{{VIDEO_PATH}}', video_path)
    script = script.replace('{{COLOR_METRIC}}', config.get('color_metric', 'Average'))
    script = script.replace('{{FRAME_TYPE}}', config.get('frame_type', 'whole_frame'))
    script = script.replace('{{BARCODE_TYPE}}', config.get('barcode_type', 'color'))
    script = script.replace('{{SAMPLED_RATE}}', str(config.get('sampled_rate', 1)))
    script = script.replace('{{SKIP_OVER}}', str(config.get('skip_over', 0)))
    script = script.replace('{{TOTAL_FRAMES}}', str(config.get('total_frames', -1)))
    script = script.replace('{{FRAMES_PER_COLUMN}}', str(config.get('frames_per_column', 1)))
    
    return script


def submit_slurm_job(script_path):
    """Submit a job to SLURM and return the job ID"""
    try:
        result = subprocess.run(
            ['sbatch', script_path],
            capture_output=True,
            text=True,
            check=True
        )
        # Parse job ID from output like "Submitted batch job 12345"
        match = re.search(r'Submitted batch job (\d+)', result.stdout)
        if match:
            return match.group(1)
        else:
            raise Exception(f"Could not parse job ID from sbatch output: {result.stdout}")
    except subprocess.CalledProcessError as e:
        raise Exception(f"Failed to submit job: {e.stderr}")


def get_job_status(slurm_job_id):
    """Check the status of a SLURM job"""
    try:
        # First check if job is in queue (pending or running)
        result = subprocess.run(
            ['squeue', '-j', slurm_job_id, '--format=%T', '--noheader'],
            capture_output=True,
            text=True
        )
        
        if result.stdout.strip():
            status = result.stdout.strip()
            # Map SLURM states to our states
            if status in ['PENDING', 'CONFIGURING']:
                return 'PENDING'
            elif status in ['RUNNING', 'COMPLETING']:
                return 'RUNNING'
            else:
                return status
        
        # If not in queue, check completed jobs
        result = subprocess.run(
            ['sacct', '-j', slurm_job_id, '--format=State', '--noheader', '-n'],
            capture_output=True,
            text=True
        )
        
        if result.stdout.strip():
            status = result.stdout.strip().split()[0]  # Get first word
            if status == 'COMPLETED':
                return 'COMPLETED'
            elif status in ['FAILED', 'CANCELLED', 'TIMEOUT', 'NODE_FAIL']:
                return 'FAILED'
            else:
                return status
        
        return 'UNKNOWN'
        
    except subprocess.CalledProcessError as e:
        return 'ERROR'


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'KALMUS SLURM API is running',
        'work_dir': WORK_DIR
    })


@app.route('/api/submit-job', methods=['POST'])
def submit_job():
    """Submit a video processing job to SLURM"""
    
    # Check if file is present
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    job_dir = Path(WORK_DIR) / f"job_{timestamp}_{job_id[:8]}"
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded video
    filename = secure_filename(file.filename)
    video_path = job_dir / filename
    file.save(video_path)
    
    # Get configuration from form data
    config = {
        'color_metric': request.form.get('color_metric', 'Average'),
        'frame_type': request.form.get('frame_type', 'whole_frame'),
        'barcode_type': request.form.get('barcode_type', 'color'),
        'sampled_rate': int(request.form.get('sampled_rate', 1)),
        'skip_over': int(request.form.get('skip_over', 0)),
        'total_frames': int(request.form.get('total_frames', -1)),
        'frames_per_column': int(request.form.get('frames_per_column', 1))
    }
    
    # Save job metadata
    metadata = {
        'job_id': job_id,
        'timestamp': timestamp,
        'filename': filename,
        'config': config,
        'status': 'PENDING'
    }
    
    with open(job_dir / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Generate SLURM script
    script_content = generate_slurm_script(
        job_id=job_id,
        video_path=str(video_path),
        output_dir=str(job_dir),
        config=config
    )
    
    script_path = job_dir / 'job_script.sh'
    with open(script_path, 'w') as f:
        f.write(script_content)
    
    # Make script executable
    os.chmod(script_path, 0o755)
    
    # Submit to SLURM
    try:
        slurm_job_id = submit_slurm_job(str(script_path))
        
        # Update metadata with SLURM job ID
        metadata['slurm_job_id'] = slurm_job_id
        with open(job_dir / 'metadata.json', 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'slurm_job_id': slurm_job_id,
            'message': 'Job submitted successfully'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/job-status/<job_id>', methods=['GET'])
def check_job_status(job_id):
    """Check the status of a submitted job"""
    
    # Find job directory
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_dir = job_dirs[0]
    
    # Read metadata
    metadata_path = job_dir / 'metadata.json'
    if not metadata_path.exists():
        return jsonify({'error': 'Job metadata not found'}), 404
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    slurm_job_id = metadata.get('slurm_job_id')
    
    if slurm_job_id:
        # Check SLURM status
        slurm_status = get_job_status(slurm_job_id)
        
        # Check for status file (written by the processing script)
        status_file = job_dir / 'status.txt'
        if status_file.exists():
            with open(status_file, 'r') as f:
                file_status = f.read().strip()
            if file_status == 'COMPLETED':
                slurm_status = 'COMPLETED'
            elif file_status == 'FAILED':
                slurm_status = 'FAILED'
        
        # Check for error file
        error_message = None
        error_file = job_dir / 'error.txt'
        if error_file.exists():
            with open(error_file, 'r') as f:
                error_message = f.read().strip()
        
        return jsonify({
            'job_id': job_id,
            'slurm_job_id': slurm_job_id,
            'status': slurm_status,
            'error': error_message,
            'timestamp': metadata.get('timestamp'),
            'config': metadata.get('config')
        }), 200
    else:
        return jsonify({'error': 'SLURM job ID not found'}), 500


@app.route('/api/job-result/<job_id>', methods=['GET'])
def get_job_result(job_id):
    """Get the result of a completed job"""
    
    # Find job directory
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_dir = job_dirs[0]
    
    # Check if result exists
    json_result = job_dir / 'barcode.json'
    if not json_result.exists():
        return jsonify({'error': 'Result not ready yet'}), 404
    
    # Return JSON result
    with open(json_result, 'r') as f:
        result = json.load(f)
    
    return jsonify(result), 200


@app.route('/api/job-result/<job_id>/png', methods=['GET'])
def get_job_result_png(job_id):
    """Download the PNG barcode image"""
    
    # Find job directory
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_dir = job_dirs[0]
    png_result = job_dir / 'barcode.png'
    
    if not png_result.exists():
        return jsonify({'error': 'PNG not ready yet'}), 404
    
    return send_file(png_result, mimetype='image/png', as_attachment=True, download_name='barcode.png')


@app.route('/api/cancel-job/<job_id>', methods=['POST'])
def cancel_job(job_id):
    """Cancel a running or pending job"""
    
    # Find job directory
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_dir = job_dirs[0]
    
    # Read metadata
    metadata_path = job_dir / 'metadata.json'
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    slurm_job_id = metadata.get('slurm_job_id')
    
    if slurm_job_id:
        try:
            subprocess.run(['scancel', slurm_job_id], check=True)
            return jsonify({
                'success': True,
                'message': f'Job {slurm_job_id} cancelled'
            }), 200
        except subprocess.CalledProcessError as e:
            return jsonify({'error': f'Failed to cancel job: {str(e)}'}), 500
    else:
        return jsonify({'error': 'SLURM job ID not found'}), 500


@app.route('/api/list-jobs', methods=['GET'])
def list_jobs():
    """List all jobs"""
    jobs = []
    
    for job_dir in sorted(Path(WORK_DIR).glob('job_*'), reverse=True):
        metadata_path = job_dir / 'metadata.json'
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            
            # Get current status
            slurm_job_id = metadata.get('slurm_job_id')
            if slurm_job_id:
                status = get_job_status(slurm_job_id)
            else:
                status = 'UNKNOWN'
            
            jobs.append({
                'job_id': metadata.get('job_id'),
                'slurm_job_id': slurm_job_id,
                'timestamp': metadata.get('timestamp'),
                'filename': metadata.get('filename'),
                'status': status
            })
    
    return jsonify({'jobs': jobs}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
