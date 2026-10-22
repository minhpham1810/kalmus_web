import getpass
import subprocess
import time
from typing import Optional
import shutil
from pathlib import Path

RESULTS_ROOT = Path("/results")

SBATCH_SCRIPT = "/home/kalmus/generate_frame_scatter.sh"
MAX_CONCURRENT = 8 # number of jobs running or waiting concurrently
POLL_SECONDS = 30 # time to check whether a slot is free

def find_job_dirs():
    """
    find individual job directory
    """
    result = []

    for pth in RESULTS_ROOT.iterdir():
        if pth.is_dir() and (pth / "thumbnails.json").exists():
            result.append(pth)
    return sorted(result)

########## DELETION FILES ##########
def delete_fs_folder(job_dir: Path, preview_only: bool = True) -> bool:
    """
    Delete a result's frame-scatter folder
    params: job_dir: job directory to delete
            preview_only: false if ready to delete, otherwise prints
    return: true if deleted, false otherwise
    """

    target = job_dir / "frame-scatter"
    if not target.exists():
        return False
    if target.is_symlink() or not target.is_dir():
        print(f"not a plain directory: {target}")
        return False

    if preview_only:
        print(f"previewing deletion of {target}")
    else:
        shutil.rmtree(target)
        print(f"{target} deleted")
    return True

def delete_one(job_id: str, preview_only: bool = True) -> None:
    """
    JUST FOR ONE JOB
    """
    if not job_id:
        print("no job id given")
        return

    job_dir = RESULTS_ROOT / job_id
    if not job_dir.is_dir():
        print(f"no job directory found for {job_id}")
        return

    delete_fs_folder(job_dir, preview_only=preview_only)

def delete_all(preview_only: bool = True) -> None:
    """
    Delete the frame-scatter folder of every job.
    """
    if not preview_only:
        answer = input("This permanently deletes the frame-scatter folder of EVERY job. Type DELETE to continue: ")
        if answer != "DELETE":
            print("cancelled")
            return

    count = 0
    for job_dir in find_job_dirs():
        if delete_fs_folder(job_dir, preview_only):
            count += 1

    action = "would delete" if preview_only else "deleted"
    print(f"{action} {count} frame-scatter folders")
########## ##########

########## SUBMISSION FUNCTIONS ##########
def submit_generation(job_id: str, preview_only: bool = True) -> Optional[str]:
    """
    Submit canvas generation for a film to SLURM.
    params: job_id: job id
            preview_only: false if ready to submit, otherwise prints
    return: SLURM job number.
    """
    if preview_only:
        print(f"preview: sbatch {SBATCH_SCRIPT} {job_id}")
        return None

    result = subprocess.run(
        ["sbatch", SBATCH_SCRIPT, job_id], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"sbatch failed for {job_id}: {result.stderr.strip()}")
        return None

    slurm_id = result.stdout.strip().split()[-1]
    print(f"slurm {slurm_id} submitted")
    return slurm_id

def generate_one(job_id: str, preview_only: bool = True) -> None:
    if not (RESULTS_ROOT / job_id).is_dir():
        print(f"no job directory found for {job_id}")
        return
    submit_generation(job_id, preview_only=preview_only)

def count_jobs() -> int:
    """
    Count the amount of SLURM jobs that are currently running or waiting.
    """
    out = subprocess.run(
        ["squeue", "-u", getpass.getuser(), "h", "-o", "%i"],
        capture_output = True, text = True,
    )
    return len(out.stdout.split())

def generate_all(preview_only: bool = True) -> None:
    jobs = find_job_dirs()
    for i, job_dir in enumerate(jobs, start = 1):
        if not preview_only:
            while count_jobs() >= MAX_CONCURRENT:
                time.sleep(POLL_SECONDS)
            print(f"[{i} / {len(jobs)}]", end = "")
            submit_generation(job_dir, preview_only = preview_only)
########## ##########

def list_jobs():
    jobs_pth = find_job_dirs()
    print(f"{len(jobs_pth)} jobs found")
    for job_dir in jobs_pth:
        pth_state = "has frame-scatter" if (job_dir / "frame-scatter").exists() else "no frame-scatter"
        print(f"{job_dir.name} {pth_state}")

def main():
    list_jobs()
    print("")
    generate_one("4dd71df2-9636-415b-a1df-9fcf49b54e2e", preview_only = False)
    # delete_one("", preview_only=False)


if __name__ == "__main__":
    delete_all(preview_only=True)
    main()