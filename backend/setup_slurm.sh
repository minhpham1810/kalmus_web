#!/bin/bash

# SLURM Deployment Setup Script
# Run this on your university's login/head node

set -e

echo "============================================"
echo "KALMUS SLURM Deployment Setup"
echo "============================================"
echo ""

# Check if running on a SLURM system
if ! command -v sbatch &> /dev/null; then
    echo "Error: sbatch command not found. This script must be run on a system with SLURM."
    exit 1
fi

echo "✓ SLURM detected"

# Get user information
read -p "Enter your email for SLURM notifications: " USER_EMAIL
read -p "Enter work directory path (default: $HOME/kalmus_jobs): " WORK_DIR
WORK_DIR=${WORK_DIR:-$HOME/kalmus_jobs}
read -p "Enter venv path (default: $HOME/kalmus_venv): " VENV_PATH
VENV_PATH=${VENV_PATH:-$HOME/kalmus_venv}

echo ""
echo "Configuration:"
echo "  Work Directory: $WORK_DIR"
echo "  Venv Path: $VENV_PATH"
echo "  Email: $USER_EMAIL"
echo ""
read -p "Continue with these settings? (y/n): " CONFIRM

if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
    echo "Setup cancelled."
    exit 0
fi

# Create directories
echo ""
echo "Creating directories..."
mkdir -p "$WORK_DIR"
mkdir -p "$(dirname $VENV_PATH)"

# Create virtual environment
echo ""
echo "Creating Python virtual environment..."
if [ ! -d "$VENV_PATH" ]; then
    python3 -m venv "$VENV_PATH"
    echo "✓ Virtual environment created"
else
    echo "! Virtual environment already exists"
fi

# Activate and install dependencies
echo ""
echo "Installing Python dependencies..."
source "$VENV_PATH/bin/activate"
pip install --upgrade pip
pip install -r requirements.txt

echo "✓ Dependencies installed"

# Create .env file
echo ""
echo "Creating .env configuration..."
cat > .env << EOF
KALMUS_WORK_DIR=$WORK_DIR
KALMUS_VENV_PATH=$VENV_PATH
KALMUS_USER_EMAIL=$USER_EMAIL
FLASK_ENV=production
EOF

echo "✓ Configuration file created"

# Make scripts executable
echo ""
echo "Setting script permissions..."
chmod +x slurm_template.sh
chmod +x process_video.py
chmod +x app_slurm.py

echo "✓ Permissions set"

# Test SLURM
echo ""
echo "Testing SLURM access..."
squeue -u $USER > /dev/null 2>&1 && echo "✓ SLURM access confirmed" || echo "! Warning: Could not access SLURM queue"

# Test Python imports
echo ""
echo "Testing Python environment..."
python -c "import flask, kalmus; print('✓ Required packages available')" || echo "! Warning: Some packages may be missing"

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Start the Flask API:"
echo "   source $VENV_PATH/bin/activate"
echo "   source .env"
echo "   python app_slurm.py"
echo ""
echo "2. Or run in background with screen:"
echo "   screen -S kalmus-api"
echo "   source $VENV_PATH/bin/activate"
echo "   source .env"
echo "   python app_slurm.py"
echo "   # Press Ctrl+A then D to detach"
echo ""
echo "3. Test the API:"
echo "   curl http://localhost:5000/api/health"
echo ""
echo "4. Configure frontend .env with:"
echo "   NEXT_PUBLIC_API_BASE_URL=http://$(hostname):5000"
echo ""
echo "See SLURM_DEPLOYMENT.md for detailed instructions."
