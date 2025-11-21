from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
import tempfile
from pathlib import Path
from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator, color_metrics, frame_types, barcode_types

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'message': 'KALMUS API is running'})


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
    """Generate barcode from uploaded video file"""
    
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


@app.route('/api/download-barcode/<filename>', methods=['GET'])
def download_barcode(filename):
    """Download the generated barcode JSON file"""
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(file_path, as_attachment=True, download_name=filename)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
