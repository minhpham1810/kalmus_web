# KALMUS Movie Barcode Generator - Frontend

A Next.js application for generating movie color barcodes using the KALMUS library on HPC clusters via SLURM.

## Features

- **Video Upload & Processing**: Direct upload for files under 50MB, chunked parallel upload (4 concurrent requests, 5–25MB chunks) for larger files, assembled server-side
- **Multiple Analyses Per Upload**: Submit several barcode configurations (barcode type / frame type / color metric combinations) for the same video in one submission, tracked as a batch
- **Duplicate Detection**: Checks for an existing analysis with the same film + configuration before processing, with an option to force reprocessing
- **Movie Metadata**: OMDb search/lookup proxied and cached server-side (5 min for search, 30 min for details); selected metadata is saved into the job's `metadata.json`
- **Color Barcode Generation & Visualizations**: Color barcode image, interactive hue histogram (raw HSV or perceptual OKLCH chroma), RGB cube, hue/light scatter plot, hue/light 3D bar plot, side-by-side comparison between analyses, and a zoomable frame-scatter view with per-frame thumbnails
- **CSV Export**: Export the underlying color/brightness data for a result
- **SLURM Integration**: Job submission (`sbatch`) and status polling (`squeue`/`sacct`)
- **Real-time Monitoring**: Results page polls job status and renders visualizations once processing completes
- **Email Notifications**: Optional email on job completion, linking back to the results dashboard
- **Film-of-the-Day**: Deterministic daily featured film, indexed by Eastern time day
- **Admin Dashboard**: Job listing/search joined with film metadata (`/admin/dashboard`) and a film catalog editor (`/admin`) for editing/curating film records and previewing barcode images
- **Tutorials Page**: In-app usage guide (`/tutorials`)
- **Dark/Light Theme**: Grayscale theme levels via a client-side theme provider
- **Modern UI**: React 19 with Tailwind CSS

## Quick Start

Run the following command to deploy the project to Kalmus's domain:

```
cd app
bash deploy.sh
```

This runs `npm run build` and (re)starts the app under `pm2` as the `kalmus` process.

For local development, see the root [`CLAUDE.md`](../CLAUDE.md) for the full command list (`npm run dev`, `npm run lint`, running frontend/backend tests).

## Architecture

**Stack:** Next.js 16 (React 19, TypeScript, Tailwind CSS 4) + Python on SLURM HPC

### Structure

```
frontend/
├── app/
│   ├── page.tsx                          # Home — upload + config
│   ├── upload/page.tsx                   # Upload flow
│   ├── submitted/[jobId]/page.tsx        # Single-job submission confirmation
│   ├── submitted/batch/[batchId]/page.tsx# Multi-analysis batch confirmation
│   ├── results/[jobId]/page.tsx          # Results — visualizations
│   ├── about/page.tsx, tutorials/page.tsx
│   ├── admin/page.tsx                    # Film catalog editor
│   ├── admin/dashboard/page.tsx          # Job listing/search dashboard
│   ├── api/                              # Backend API routes (see below)
│   └── components/                       # React UI + Plotly visualization components
├── lib/
│   ├── slurm.ts              # SLURM job submission/status
│   ├── hpc-transfer.ts       # SSH/NFS file transfer helpers
│   ├── barcode-utils.ts      # Color math (RGB↔OKLCH), histograms, CSV export
│   ├── barcode-submission.ts, barcode-result.ts, job-metadata.ts
│   ├── multi-analysis.ts, submission-batches.ts
│   ├── admin-films.ts, film-format.ts, film-of-day.ts
│   ├── db.ts                 # SQLite access (film catalog / admin metadata)
│   └── kalmus_compare.py, kalmus_visualizer.py, send_barcode_email.py  # Python bridge scripts
└── package.json
```

### API routes (`app/api/`)

| Route | Purpose |
|---|---|
| `POST /api/generate-barcode` | Direct upload (<50MB), immediate SLURM submission |
| `POST /api/upload-chunk` | Chunked upload receiver for large files |
| `POST /api/assemble-file` | Assembles chunks, writes `metadata.json`, submits `sbatch` |
| `GET /api/job-status/[jobId]` | Polls `squeue`/`sacct` for job state |
| `GET /api/job/[jobId]` | Job lookup |
| `GET /api/job-result/[jobId]` | Merged `metadata.json` + `barcode.json` + `summary.json` |
| `GET /api/job-result/[jobId]/thumbnail-sheet/[sheetIndex]` | Per-frame thumbnail sheet for the frame-scatter view |
| `GET /api/frame-scatter-tiles/[jobId]/...` | Tiled frame-scatter assets |
| `GET /api/barcode-image/[jobId]` | Rendered `barcode.png` |
| `GET /api/visualization/{hue-histogram,rgb-cube,hue-light-scatter,hue-light-3dbar}[/[jobId]]` | Server-side visualization data helpers |
| `POST /api/visualization/compare` | Data for side-by-side comparison of multiple jobs |
| `GET /api/omdb/search`, `GET /api/omdb/get` | Cached OMDb search/detail proxy |
| `GET /api/search-films` | Film catalog search |
| `GET /api/duplicate-check` | Checks for an existing analysis with the same film + config |
| `GET/POST /api/submission-batches/[batchId]` | Multi-analysis batch tracking |
| `GET/PUT /api/edit-film/[jobId]` | Edit a film's catalog metadata |
| `GET /api/film-of-day` | Deterministic daily featured film |
| `GET /api/admin/jobs` | Job listing joined with film metadata, for the admin dashboard |
| `GET /api/options` | Available barcode/frame/metric configuration options |
| `GET /api/health` | Health check |

### Workflow

```
Upload video → Configure one or more analyses → Submit (checks for duplicates)
        │
        ▼
  Next.js API route writes SLURM batch script per analysis
        │
        ▼
  sbatch → compute node runs the KALMUS pipeline (backend/command_line_generator.py)
        │
        ▼
  Outputs barcode.png, barcode.json, summary.json
  to the shared NFS results directory for the job
        │
        ▼
  Results page polls status, then renders visualizations
  (barcode image, hue histogram, RGB cube, hue/light scatter, 3D bar,
  frame scatter with thumbnails, comparison, CSV export)
        │
        ▼
  Optional email notification links back to the results page
```

### Key details

- Large files use chunked parallel upload (4 concurrent, 5–25MB chunks), then server-side assembly
- SLURM jobs get 4 CPUs, 16GB RAM, 1hr limit
- Python side uses the KALMUS library for color extraction from video frames
- Visualizations rendered client-side with Plotly.js; heavier per-job data prep happens server-side under `/api/visualization/*`
- Shared NFS filesystem bridges the web server and compute nodes (`UPLOAD_DIR`, `RESULTS_DIR`, `SCRIPTS_DIR` in `.env.local`)
- Job state is file-based (per-`jobId` NFS directory); a separate SQLite database (`lib/db.ts`) tracks the film catalog and admin metadata (submission batches, film-of-day, duplicate detection) — see the root [`CLAUDE.md`](../CLAUDE.md) for the full breakdown
- Optional email notification on job completion via `lib/send_barcode_email.py`

---

All frontend-backend communication is standard HTTP (fetch/XHR) to Next.js API routes. File uploads use `FormData`; everything else is JSON.

For OMDb: the frontend proxies all OMDb calls through its own API routes (`/api/omdb/search` and `/api/omdb/get`), with in-memory caching (5min for search, 30min for details). When a job is submitted, the selected movie's metadata is sent along (`imdb_id`, `title`, `year`, `genre`, `director`, `plot`, `poster_url`) plus the full raw OMDb response in a `raw` field. This is saved into the job's `metadata.json`, so the full OMDb snapshot is persisted per-job. Since these API routes run server-side in Next.js, OMDb queries are already effectively on the backend.

If a job has completed successfully, `/api/job-result/[jobId]` returns the full barcode JSON (colors array, brightness array, processing params), the summary stats, and the metadata (including the cached OMDb data from submission time) in one merged payload.
