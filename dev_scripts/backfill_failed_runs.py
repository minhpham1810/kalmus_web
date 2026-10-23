"""
Fill in the failed_runs table for jobs that failed or timed out before it existed, from each job's status.txt
in the results directory. Safe to re-run: a job already in the table has its row replaced.
"""


from datetime import datetime
from pathlib import Path
import json
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import FilmsDb


def exit_code(job_dir: Path) -> int | None:
    """The exit code the SLURM script logged ("Exit code: N"), or None (e.g. timeouts never reach that line)."""
    for log in job_dir.glob("slurm_*.stdout.txt"):
        if match := re.search(r"^Exit code: (\d+)$", log.read_text(errors="replace"), re.M):
            return int(match.group(1))
    return None


def backfill_failed_runs(db: FilmsDb) -> int:
    """Record every FAILED or TIMEOUT job in the results directory, dated by when its status.txt was written. Returns the count."""
    count = 0
    for status_file in db.results_dir.glob("*/status.txt"):
        status = status_file.read_text().strip()
        if status not in ("FAILED", "TIMEOUT"):
            continue
        job_dir = status_file.parent
        try:
            db.record_failure(job_dir.name, status, exit_code(job_dir), datetime.fromtimestamp(status_file.stat().st_mtime))
            count += 1
        except (OSError, ValueError) as e:  # missing or invalid metadata.json (JSONDecodeError is a ValueError)
            print(f"Skipping {job_dir.name}: {e}")
    return count


def main():
    print(f"Recorded {backfill_failed_runs(FilmsDb())} failed runs")


if __name__ == "__main__":
    main()
