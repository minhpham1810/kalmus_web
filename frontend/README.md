# KALMUS Movie Barcode Generator - Frontend

A Next.js application for generating movie color barcodes using the KALMUS library on HPC clusters via SLURM.

## Features

- **Video Upload & Processing**: Upload videos and process them on HPC compute nodes
- **Color Barcode Generation**: Create visual timeline representations and statistic visualizations of movies
- **SLURM Integration**: Direct job submission to HPC clusters
- **Real-time Monitoring**: Track job status with live updates
- **Authentication Ready**: Supports header-based auth (Shibboleth, CAS)
- **Modern UI**: React 19 with Tailwind CSS

## Quick Start

Run the following command to deploy the project to Kalmus's domain:

```
cd app
bash deploy.sh
```

## Architecture

**Stack:** Next.js 16 (React 19, TypeScript, Tailwind CSS 4) + Python on SLURM HPC

### Structure

```
frontend/
├── app/
│   ├── page.tsx                  # Home — upload + config
│   ├── results/[jobId]/page.tsx  # Results — visualizations
│   ├── api/                      # Backend API routes
│   │   ├── generate-barcode/     # Direct upload (<50MB)
│   │   ├── upload-chunk/         # Chunked upload (large files)
│   │   ├── assemble-file/        # Assemble chunks → submit job
│   │   ├── job-status/[jobId]/   # Poll SLURM job status
│   │   ├── job-result/[jobId]/   # Fetch completed results
│   │   ├── visualization/        # Hue histogram, RGB cube, scatter, 3D bar, compare
│   │   └── omdb/                 # Movie metadata search
│   ├── components/               # React UI components
│   └── lib/
│       ├── slurm.ts              # SLURM job submission/status
│       └── barcode-utils.ts      # Color math, histograms, CSV export
└── package.json
```

### Workflow

```
Upload video → Configure options → Submit
        │
        ▼
  Next.js API route writes SLURM batch script
        │
        ▼
  sbatch → compute node runs kalmus_processor.py
        │
        ▼
  Outputs barcode.png, barcode.json, summary.json
  to /shared/kalmus/results/[jobId]/
        │
        ▼
  Results page polls status, then renders visualizations
  (hue histogram, RGB cube, hue/light scatter, 3D bar, comparison)
```

### Key details

- Large files use chunked parallel upload (4 concurrent, 5–25MB chunks), then server-side assembly
- SLURM jobs get 4 CPUs, 16GB RAM, 1hr limit
- Python side uses the KALMUS library for color extraction from video frames
- Visualizations rendered client-side with Plotly.js
- Shared NFS filesystem bridges the web server and compute nodes
- Optional email notification on job completion

---


All frontend-backend communication is standard HTTP (fetch/XHR) to Next.js API routes. File uploads use `FormData`; everything else is JSON.

For OMDB: the frontend already proxies all OMDb calls through its own API routes (`/api/omdb/search` and `/api/omdb/get`), with in-memory caching (5min for search, 30min for details). When a job is submitted, only the selected movie's metadata is sent along (`imdb_id`, `title`, `year`, `genre`, `director`, `plot`, `poster_url`) — plus the full raw OMDb response is included in a `raw` field. This all gets saved into the job's `metadata.json` which can be seen in the `results` folder (we should move this and route all future outputs to the backend later on), so the full OMDb snapshot is already persisted per-job. Since the API routes run server-side in Next.js, OMDB queries are effectively already on the backend, there's no reason to move them elsewhere.


If a job has completed successfully, it returns the full barcode JSON (colors array, brightness array, processing params), the summary stats, and the metadata (which includes the cached OMDB data from submission time). So yes, the processed barcode JSON is the primary return, and the OMDB data comes back with it for free since it was stored in `metadata.json` at submission.
