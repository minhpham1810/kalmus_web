# KALMUS Movie Barcode Generator - Frontend

A Next.js application for generating movie color barcodes using the KALMUS library on HPC clusters via SLURM.

## Features

- 🎬 **Video Upload & Processing**: Upload videos and process them on HPC compute nodes
- 🎨 **Color Barcode Generation**: Create visual timeline representations of movies
- ⚡ **SLURM Integration**: Direct job submission to HPC clusters
- 📊 **Real-time Monitoring**: Track job status with live updates
- 🔐 **Authentication Ready**: Supports header-based auth (Shibboleth, CAS)
- 📱 **Modern UI**: React 19 with Tailwind CSS

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup script
./setup-dev.sh

# 3. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your paths

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🚀

## Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get running in 5 minutes
- **[SETUP.md](./SETUP.md)** - Complete setup and configuration guide
- **[MIGRATION_SUMMARY.md](./MIGRATION_SUMMARY.md)** - Architecture changes explained

## Architecture

This is a **self-contained Next.js application** that handles both frontend and backend operations:

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Application                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐        │
│  │  React           │         │  API Routes      │        │
│  │  Components      │────────▶│  (Server-side)   │        │
│  │  (Client-side)   │  fetch  │                  │        │
│  └──────────────────┘         └─────────┬────────┘        │
│                                          │                  │
└──────────────────────────────────────────┼──────────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │    SLURM     │
                                    │   Commands   │
                                    └──────┬───────┘
                                           │
                                           ▼
                                  ┌────────────────┐
                                  │ Compute Nodes  │
                                  │ (KALMUS runs)  │
                                  └────────────────┘
```

**Key Components:**

- **Frontend** (`app/`, `app/components/`): React UI for uploads and monitoring
- **API Routes** (`app/api/`): Next.js server endpoints that handle SLURM
- **SLURM Utilities** (`lib/slurm.ts`): Job submission and management logic
- **Processor Script** (`lib/kalmus_processor.py`): Runs on compute nodes

## Project Structure

```
frontend/
├── app/
│   ├── api/                    # Next.js API routes (SLURM integration)
│   │   ├── generate-barcode/   # Submit jobs
│   │   ├── job-status/         # Check status
│   │   ├── job-result/         # Get results
│   │   ├── job/                # Cancel jobs
│   │   ├── health/             # Health check
│   │   └── options/            # Get config options
│   ├── components/             # React components
│   │   ├── BarcodeGenerator.tsx
│   │   ├── BarcodeDisplay.tsx
│   │   ├── ConfigPanel.tsx
│   │   └── FileUpload.tsx
│   ├── page.tsx               # Main page
│   ├── layout.tsx             # App layout
│   └── globals.css            # Styles
├── lib/
│   ├── slurm.ts               # SLURM integration logic
│   └── kalmus_processor.py    # Python script for compute nodes
├── .env.local.example         # Environment config template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── tailwind.config.ts         # Tailwind config
├── setup-dev.sh               # Development setup script
├── QUICKSTART.md              # Quick start guide
├── SETUP.md                   # Detailed setup guide
└── MIGRATION_SUMMARY.md       # Architecture documentation
```

## Environment Configuration

Create `.env.local`:

```env
# API Base (leave empty for local API routes)
NEXT_PUBLIC_API_BASE_URL=

# Shared filesystem paths (accessible by web server and compute nodes)
UPLOAD_DIR=/shared/kalmus/uploads
RESULTS_DIR=/shared/kalmus/results
SCRIPTS_DIR=/shared/kalmus/scripts

# Python environment on compute nodes
PYTHON_ENV=source ~/kalmus_env/bin/activate

# KALMUS processor script location
KALMUS_SCRIPT=/shared/kalmus/kalmus_processor.py
```

## Requirements

### Web Server (where Next.js runs)
- Node.js 18+
- Access to SLURM commands (`sbatch`, `squeue`, `sacct`, `scancel`)
- Read/write access to shared filesystem

### Compute Nodes
- Python 3.8+
- KALMUS library (`pip install kalmus`)
- Dependencies: numpy, opencv-python, matplotlib, pillow, scikit-image
- Access to shared filesystem

### Shared Filesystem
- NFS or similar distributed filesystem
- Accessible from both web server and compute nodes
- Paths for uploads, results, and scripts

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/generate-barcode` | POST | Submit new video processing job |
| `/api/job-status/[jobId]` | GET | Get current job status |
| `/api/job-result/[jobId]` | GET | Get completed job results |
| `/api/job/[jobId]` | DELETE | Cancel running job |
| `/api/health` | GET | Check service health and SLURM availability |
| `/api/options` | GET | Get available configuration options |

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Type checking
npm run build

# Lint code
npm run lint
```

## Production Deployment

```bash
# Build for production
npm run build

# Start production server
npm start

# Or use PM2
pm2 start npm --name "kalmus" -- start

# Or use systemd
sudo systemctl start kalmus
```

### With Nginx

```nginx
server {
    listen 80;
    server_name kalmus.yourdomain.edu;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Configuration Options

### Color Metrics
- Average, Median, Mode, Top-dominant, Weighted-dominant, Brightest, Bright

### Frame Types
- Whole_frame, High_contrast_region, Low_contrast_region, Foreground, Background

### Barcode Types
- Color, Brightness

### SLURM Partitions
Configure in `app/api/options/route.ts`:
```typescript
partitions: ['short', 'medium', 'long', 'gpu']
```

## Customization

### Adjust SLURM Resources

Edit `lib/slurm.ts`:

```typescript
#SBATCH --cpus-per-task=4    // CPU cores
#SBATCH --mem=16GB            // Memory
#SBATCH --time=01:00:00       // Time limit
```

### File Size Limits

Create `next.config.js`:

```javascript
module.exports = {
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
};
```

## Troubleshooting

### SLURM Not Available

```bash
# Check SLURM installation
which sbatch squeue sacct

# Add to PATH if needed
export PATH=$PATH:/usr/local/slurm/bin
```

### Permission Errors

```bash
# Check filesystem permissions
ls -la /shared/kalmus/
chmod 755 /shared/kalmus/{uploads,results,scripts}
```

### Jobs Failing

```bash
# Check job logs
cat /shared/kalmus/results/[job-id]/slurm_*.stderr.txt

# Test on compute node
srun --partition=short bash -c "source ~/kalmus_env/bin/activate && python -c 'import kalmus'"
```

## Security

- File upload validation
- Filename sanitization
- User input sanitization
- Header-based authentication support
- SLURM resource limits
- Job isolation (separate directories)

## Performance

- **Local API**: No network hop between frontend and backend
- **Async Processing**: Jobs run on compute nodes
- **Polling**: 5-second intervals for status updates
- **Caching**: Results stored on shared filesystem

## Future Enhancements

- [ ] SQLite database for job history
- [ ] User dashboard with job management
- [ ] Email notifications
- [ ] Barcode comparison tools
- [ ] Batch processing
- [ ] Video thumbnails
- [ ] Advanced analytics

## Support & Resources

- **KALMUS Library**: https://github.com/KALMUS-Color-Toolkit/KALMUS
- **Next.js Docs**: https://nextjs.org/docs
- **SLURM Documentation**: https://slurm.schedmd.com/

## License

Follows KALMUS library licensing.

---

**Built with** Next.js 16 • React 19 • TypeScript • Tailwind CSS • SLURM
