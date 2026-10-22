# KALMUS Web

## 1. Project Overview
**KALMUS Web** is a web application built around the [KALMUS Python package](https://pypi.org/project/kalmus/), a computational tool for the quantitative analysis and visualization of colors in films.

It extends KALMUS's command-line and GUI tooling with a browser interface. Heavy video processing is offloaded to a High-Performance Computing (HPC) cluster via SLURM. Results come back as interactive visualizations (color barcodes, hue histograms, hue/lightness scatter plots, RGB cubes, 3D bar charts, frame scatter viewers, and side-by-side film comparisons). A SQLite film catalog backs search, a daily featured film, and an admin area for curating submissions.

---

## 2. Architecture
A Next.js app orchestrates uploads and job submission. SLURM compute nodes do the processing. The two sides share files over NFS.

### Tech Stack
- **Frontend / API:** Next.js 16 (React 19, TypeScript), Tailwind CSS 4
- **Backend processing:** Python 3.7/3.8, vendored KALMUS library, BiRefNet (foreground/background segmentation)
- **Scheduling:** SLURM (`sbatch` / `squeue` / `sacct`)
- **Visualizations:** Plotly.js (client-side), OpenSeadragon (frame scatter tiles), with some heavier math server-side
- **Storage:** shared NFS filesystem for per-job files, SQLite (`better-sqlite3`) for the film catalog

### Components
1. **Web UI:** configuration, chunked parallel uploads, results, comparison, tutorials, and admin pages.
2. **API routes:** upload assembly, OMDb proxy with in-memory caching, SLURM script generation and submission, job polling, and Python bridge scripts for visualization and email.
3. **SLURM compute nodes:** run `backend/command_line_generator.py` (4 CPUs, 16 GB RAM, 1 hour limit per job).
4. **Shared NFS:** carries uploads, scripts and job output between the web server and compute nodes.
5. **SQLite film catalog:** films, genres/people metadata, analyzed files (editions), and per-job hue/lightness values.

---

## 3. Directory Structure
```text
app/
├── backend/
│   ├── kalmus/                    # Vendored KALMUS package
│   ├── BiRefNet/                  # Foreground/background segmentation model
│   ├── database/db.py             # SQLite access (Python side)
│   ├── command_line_generator.py  # Entry point for SLURM batch jobs
│   ├── film_map.py                # Per-film primary hue / lightness
│   ├── frame_scatter_layers.py    # Frame scatter visualization support
│   ├── generate_layers.py         # Layer/tile generation (includes watermarking)
│   ├── tests/                     # pytest suite
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx               # Search / home
│   │   ├── upload/                # Upload and configuration
│   │   ├── submitted/             # Submission status (single job and batch)
│   │   ├── results/[jobId]/       # Result visualizations
│   │   ├── tutorials/, about/
│   │   ├── admin/                 # Admin pages and dashboard
│   │   ├── components/            # UI and Plotly visualization components
│   │   └── api/                   # Orchestration routes
│   ├── lib/                       # Shared logic (SLURM, DB, color math, watermark, ...)
│   ├── tests/                     # node:test unit tests
│   ├── proxy.ts                   # Admin access control
│   ├── instrumentation.ts         # Startup env validation
│   └── deploy.sh                  # Build + (re)start under pm2
├── databases/                     # SQLite files (git-ignored)
└── dev_scripts/
```

The deployment root one level above `app/` holds live NFS-mounted `results/`, `uploads/` and `slurm_scripts/`. These are not part of this repo.

---

## 4. Data Flow
1. **Upload and configuration:** the user picks a video and looks up OMDb metadata. Large files are uploaded in 5-25 MB chunks, 4 at a time, to `/api/upload-chunk`. Duplicate films are checked via `/api/duplicate-check`.
2. **Assembly and submission:** `/api/assemble-file` stitches the chunks together, writes `metadata.json`, and generates and submits the SLURM batch script (`lib/slurm.ts`). Multi-file submissions are tracked as batches.
3. **HPC processing:** a compute node runs the KALMUS pipeline, extracting frame colors and computing statistics.
4. **Output:** the node writes `barcode.png`, `barcode.json` and `summary.json` into the job directory, and records the film/analysis in the SQLite catalog.
5. **Polling and rendering:** the browser polls `/api/job-status/[jobId]`. Once complete it loads `/api/job-result/[jobId]` and renders the visualizations.

---

## 5. Storage
### Per-job files (NFS)
Each job lives in `RESULTS_DIR/[jobId]/`:

| File | Description |
|------|-------------|
| `video_input.mp4` | Temporary assembled video, removed after processing |
| `metadata.json` | OMDb fields plus the raw OMDb payload, captured at submission |
| `barcode.json` | RGB and brightness arrays, frame-by-frame processing params |
| `summary.json` | Aggregated color statistics |
| `barcode.png` | Rendered color barcode |

### Film catalog (SQLite)
Located at `FILMS_DB_PATH` and shared by the Node (`lib/db.ts`) and Python (`backend/database/db.py`) sides. It stores films and their metadata, analyzed files (editions) keyed by `job_id`, and per-job primary hue and lightness (`film_map`). It powers search, film of the day, admin curation and duplicate detection. Database files are git-ignored.

---

## 6. Features
- Chunked, parallel video upload with OMDb search and metadata
- Configurable processing (frame type, sampling, aspect ratio handling, and more)
- Visualizations: color barcode, hue histogram, hue/lightness scatter, 3D bars, RGB cube, frame scatter, color statistics dashboard
- CSV export and image download (public downloads carry a watermark; admins get clean images)
- Film comparison view and multi-file analysis
- Film search and a daily film of the day
- Admin pages (film editing, job and batch overview, dashboard) restricted by SSO username
- Email notification with a results link when a job finishes

---

## 7. API Reference
**Upload and jobs**
- `POST /api/generate-barcode`: direct upload (small files) and immediate submission
- `POST /api/upload-chunk`: chunk receiver (`chunk_data`, `chunk_index`, `upload_id`)
- `POST /api/assemble-file`: assemble chunks, write metadata, submit to SLURM
- `GET /api/job-status/[jobId]`: SLURM state (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`)
- `GET /api/job-result/[jobId]`: merged metadata, summary and barcode JSON (plus `thumbnail-sheet/[sheetIndex]`)
- `GET /api/job/[jobId]`, `PUT /api/edit-film/[jobId]`: job and film details, editing
- `GET /api/submission-batches/[batchId]`: batch progress

**Catalog and metadata**
- `GET /api/omdb/search?q=`, `GET /api/omdb/get?id=`: OMDb proxy (cached 5 min / 30 min)
- `GET /api/search-films`, `GET /api/film-of-day`, `GET /api/duplicate-check`, `GET /api/options`

**Visualization and images**
- `GET /api/visualization/{hue-histogram,hue-light-scatter,hue-light-3dbar,rgb-cube}/[jobId]`, `/api/visualization/compare`
- `GET /api/barcode-image/[jobId]`, `GET /api/frame-scatter-tiles/[jobId]/...`

**Operations**
- `GET /api/health`
- `GET /api/admin/jobs` (admin only)

---

## 8. Setup and Development
### Frontend (`frontend/`)
```bash
npm install
cp .env.local.example .env.local   # then fill in values
npm run dev       # dev server
npm run build && npm run start
npm run lint
```
The server refuses to start if a required variable is missing (`lib/env.ts`): `FILMS_DB_PATH`, `RESULTS_DIR`, `UPLOAD_DIR`, `SCRIPTS_DIR`, `PYTHON_ENV`, `KALMUS_SCRIPT`, `EMAIL_SCRIPT`, `WEBSITE_URL`, `OMDB_KEY`. Optional: `NEXT_PUBLIC_API_BASE_URL`, `SUBMISSION_BATCH_DIR`, `PYTHON_BIN`, and the `HPC_*` SSH/SFTP settings. See `.env.local.example`.

### Tests
```bash
# Frontend (node:test)
cd frontend
npx tsc -p tests/tsconfig.tests.json
node --test ../tmp/frontend-test-build/tests/*.test.js

# Backend
cd backend
python -m pip install -r requirements.txt
python -m pytest
```
New frontend test files must be added to the `include` list in `frontend/tests/tsconfig.tests.json`.

### Deployment
`frontend/deploy.sh` builds the app and (re)starts it under `pm2` as `kalmus`.

### Admin access
`/admin/*` is protected by `frontend/proxy.ts`, which checks the `x-username` SSO header against an allowlist. In non-production builds it falls back to a default admin user.

---

## 9. Conventions
- TypeScript/React: 2-space indent, semicolons, `PascalCase` components, `camelCase` functions
- Python: 4-space indent, `snake_case` functions, `PascalCase` classes
- Commits use scoped conventional prefixes, e.g. `feat(frontend):`, `fix(backend):`
- Never commit secrets, `.env.local`, SQLite databases or BiRefNet model weights
