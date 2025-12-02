from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import tempfile
import subprocess
import uuid
import re
from pathlib import Path
from datetime import datetime
from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator, color_metrics, frame_types, barcode_types

app = Flask(__name__)
CORS(app)

# Detect if SLURM is available
def is_slurm_available():
    try:
        subprocess.run(['sbatch', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

USE_SLURM = is_slurm_available()

# Configuration
if USE_SLURM:
    # SLURM mode - use configured work directory
    WORK_DIR = os.getenv('KALMUS_WORK_DIR', os.path.expanduser('~/kalmus_jobs'))
    VENV_PATH = os.getenv('KALMUS_VENV_PATH', os.path.expanduser('~/kalmus_venv'))
    USER_EMAIL = os.getenv('KALMUS_USER_EMAIL', 'user@example.com')
    UPLOAD_FOLDER = WORK_DIR
    Path(WORK_DIR).mkdir(parents=True, exist_ok=True)
else:
    # Local mode - use temp directory
    UPLOAD_FOLDER = tempfile.gettempdir()

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'KALMUS API is running',
        'mode': 'SLURM' if USE_SLURM else 'local',
        'work_dir': WORK_DIR if USE_SLURM else UPLOAD_FOLDER
    })


@app.route('/api/options', methods=['GET'])
def get_options():
    """Get available color metrics and frame types"""
    return jsonify({
        'color_metrics': list(color_metrics),
        'frame_types': list(frame_types),
        'barcode_types': list(barcode_types)
    })


@app.route('/api/generate-barcode', methods=['POST'])
def generate_barcode():
    """Generate barcode - routes to SLURM or local processing"""
    if USE_SLURM:
        return submit_slurm_job()
    else:
        return generate_barcode_local()


def generate_barcode_local():
    """Local synchronous barcode generation"""
    # Check if file is present
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': f'Invalid file type. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
    
    # Get generation parameters from form data
    color_metric = request.form.get('color_metric', 'Average')
    frame_type = request.form.get('frame_type', 'Whole_frame')
    barcode_type = request.form.get('barcode_type', 'Color')
    sampled_rate = int(request.form.get('sampled_rate', 2))
    skip_over = int(request.form.get('skip_over', 0))
    total_frames = int(request.form.get('total_frames', int(1e8)))  # Process all frames by default
    frames_per_column = int(request.form.get('frames_per_column', 50))
    
    # Validate parameters
    if color_metric not in color_metrics:
        return jsonify({'error': f'Invalid color_metric. Must be one of: {", ".join(color_metrics)}'}), 400
    
    if frame_type not in frame_types:
        return jsonify({'error': f'Invalid frame_type. Must be one of: {", ".join(frame_types)}'}), 400
    
    if barcode_type not in barcode_types:
        return jsonify({'error': f'Invalid barcode_type. Must be one of: {", ".join(barcode_types)}'}), 400
    
    # Save uploaded file temporarily
    filename = secure_filename(file.filename)
    temp_video_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(temp_video_path)
    
    try:
        # Initialize barcode generator
        generator = BarcodeGenerator(
            color_metric=color_metric,
            frame_type=frame_type,
            barcode_type=barcode_type,
            skip_over=skip_over,
            sampled_frame_rate=sampled_rate,
            total_frames=total_frames
        )
        
        # Generate barcode
        generator.generate_barcode(
            video_file_path=temp_video_path,
            num_thread=4,
            save_frames=False  # Don't save frames to keep JSON size manageable
        )
        
        # Get the generated barcode
        barcode_obj = generator.get_barcode()
        
        # Reshape barcode for better visualization
        barcode_obj.reshape_barcode(frames_per_column=frames_per_column)
        
        # Save barcode as JSON
        json_filename = f"barcode_{Path(filename).stem}.json"
        json_path = os.path.join(app.config['UPLOAD_FOLDER'], json_filename)
        barcode_obj.save_as_json(filename=json_path)
        
        # Read the JSON file
        with open(json_path, 'r') as f:
            barcode_data = json.load(f)
        
        # Clean up temporary files
        os.remove(temp_video_path)
        
        # Return the barcode data and provide download info
        return jsonify({
            'success': True,
            'message': 'Barcode generated successfully',
            'barcode': barcode_data,
            'download_filename': json_filename,
            'metadata': {
                'total_frames': barcode_obj.total_frames,
                'film_length_in_frames': barcode_obj.film_length_in_frames,
                'color_metric': color_metric,
                'frame_type': frame_type,
                'barcode_type': barcode_type,
                'sampled_frame_rate': sampled_rate,
                'barcode_shape': barcode_obj.get_barcode().shape
            }
        })
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_video_path):
            os.remove(temp_video_path)
        
        return jsonify({
            'error': f'Failed to generate barcode: {str(e)}'
        }), 500


def submit_slurm_job():
    """Submit job to SLURM for async processing"""
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file'}), 400
    
    # Create job directory
    job_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    job_dir = Path(WORK_DIR) / f"job_{timestamp}_{job_id[:8]}"
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Save video
    filename = secure_filename(file.filename or 'video.mp4')
    video_path = job_dir / filename
    file.save(str(video_path))
    
    # Get config
    config = {
        'color_metric': request.form.get('color_metric', 'Average'),
        'frame_type': request.form.get('frame_type', 'Whole_frame'),
        'barcode_type': request.form.get('barcode_type', 'Color'),
        'sampled_rate': int(request.form.get('sampled_rate', 2)),
        'skip_over': int(request.form.get('skip_over', 0)),
        'total_frames': int(request.form.get('total_frames', 100000000)),
        'frames_per_column': int(request.form.get('frames_per_column', 50))
    }
    
    # Create SLURM script
    script_content = f"""#!/bin/bash
#SBATCH -p short
#SBATCH -N 1
#SBATCH -n 4
#SBATCH --mem=16384
#SBATCH --job-name=kalmus_{job_id[:8]}
#SBATCH -o {job_dir}/slurm.%j.out
#SBATCH -e {job_dir}/slurm.%j.err
#SBATCH --mail-user={USER_EMAIL}
#SBATCH --mail-type=END,FAIL

source {VENV_PATH}/bin/activate
cd {Path(__file__).parent}

python -c "
import sys
sys.path.insert(0, '{Path(__file__).parent}')
from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator
import json
from pathlib import Path

try:
    Path('{job_dir}/status.txt').write_text('PROCESSING')
    gen = BarcodeGenerator(
        color_metric='{config['color_metric']}',
        frame_type='{config['frame_type']}',
        barcode_type='{config['barcode_type']}',
        skip_over={config['skip_over']},
        sampled_frame_rate={config['sampled_rate']},
        total_frames={config['total_frames']}
    )
    gen.generate_barcode(video_file_path='{video_path}', num_thread=4, save_frames=False)
    barcode = gen.get_barcode()
    barcode.reshape_barcode(frames_per_column={config['frames_per_column']})
    barcode.save_as_json(filename='{job_dir}/barcode.json')
    Path('{job_dir}/status.txt').write_text('COMPLETED')
except Exception as e:
    Path('{job_dir}/status.txt').write_text('FAILED')
    Path('{job_dir}/error.txt').write_text(str(e))
    sys.exit(1)
"
"""
    
    script_path = job_dir / 'job.sh'
    script_path.write_text(script_content)
    script_path.chmod(0o755)
    
    # Submit job
    try:
        result = subprocess.run(['sbatch', str(script_path)], capture_output=True, text=True, check=True)
        match = re.search(r'Submitted batch job (\d+)', result.stdout)
        slurm_job_id = match.group(1) if match else 'unknown'
        
        # Save metadata
        (job_dir / 'metadata.json').write_text(json.dumps({
            'job_id': job_id,
            'slurm_job_id': slurm_job_id,
            'timestamp': timestamp,
            'filename': filename,
            'config': config
        }))
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'slurm_job_id': slurm_job_id,
            'message': 'Job submitted to cluster'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/job-status/<job_id>', methods=['GET'])
def check_job_status(job_id):
    """Check SLURM job status"""
    if not USE_SLURM:
        return jsonify({'error': 'SLURM mode not enabled'}), 400
    
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    job_dir = job_dirs[0]
    status_file = job_dir / 'status.txt'
    
    if status_file.exists():
        status = status_file.read_text().strip()
    else:
        status = 'PENDING'
    
    error = None
    error_file = job_dir / 'error.txt'
    if error_file.exists():
        error = error_file.read_text().strip()
    
    return jsonify({
        'job_id': job_id,
        'status': status,
        'error': error
    }), 200


@app.route('/api/job-result/<job_id>', methods=['GET'])
def get_job_result(job_id):
    """Get completed job result"""
    if not USE_SLURM:
        return jsonify({'error': 'SLURM mode not enabled'}), 400
    
    job_dirs = list(Path(WORK_DIR).glob(f"job_*_{job_id[:8]}"))
    if not job_dirs:
        return jsonify({'error': 'Job not found'}), 404
    
    result_file = job_dirs[0] / 'barcode.json'
    if not result_file.exists():
        return jsonify({'error': 'Result not ready'}), 404
    
    with open(result_file) as f:
        return jsonify(json.load(f)), 200


@app.route('/api/download-barcode/<filename>', methods=['GET'])
def download_barcode(filename):
    """Download the generated barcode JSON file"""
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(file_path, as_attachment=True, download_name=filename)


if __name__ == '__main__':
    print(f"Starting KALMUS API in {'SLURM' if USE_SLURM else 'LOCAL'} mode")
    if USE_SLURM:
        print(f"Work directory: {WORK_DIR}")
    app.run(debug=True, host='0.0.0.0', port=5000)
