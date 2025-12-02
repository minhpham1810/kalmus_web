#!/bin/bash

echo ""
echo "========================================"
echo "   KALMUS Movie Barcode Generator"
echo "   (with SLURM Job Submission)"
echo "========================================"
echo ""
echo "Starting both backend and frontend servers..."
echo ""
echo "Backend (Node.js) will run on: http://localhost:5000"
echo "Frontend (Next.js) will run on: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Check if node_modules exist
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Start backend (Node.js)
cd backend
echo "Starting Node.js backend..."
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend (Next.js)
cd frontend
echo "Starting Next.js frontend..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✓ Both servers are running"
echo "✓ Backend PID: $BACKEND_PID"
echo "✓ Frontend PID: $FRONTEND_PID"
echo ""
echo "=========================================="
echo "Open http://localhost:3000 in your browser"
echo "=========================================="
echo ""
echo "Notes:"
echo "- Upload videos to submit SLURM jobs"
echo "- Jobs will run on HPC compute nodes"
echo "- Check job status in real-time"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
wait
