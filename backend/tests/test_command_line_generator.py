from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import command_line_generator as clg


def test_check_should_process_allows_force_reprocess(monkeypatch, tmp_path):
    monkeypatch.setattr(clg, "find_existing_analysis", lambda *args, **kwargs: "existing-job")
    duplicate_marker_paths: list[tuple[str, str]] = []
    monkeypatch.setattr(
        clg,
        "write_duplicate_marker",
        lambda output_dir, existing_job_id: duplicate_marker_paths.append(
            (output_dir, existing_job_id),
        ),
    )

    should_process = clg.check_should_process(
        "tt0133093",
        "color",
        "whole_frame",
        "average",
        force_reprocess=True,
        output_dir=str(tmp_path),
    )

    assert should_process is True
    assert duplicate_marker_paths == []


def test_check_should_process_marks_duplicate_when_not_forcing(monkeypatch, tmp_path):
    monkeypatch.setattr(clg, "find_existing_analysis", lambda *args, **kwargs: "existing-job")
    duplicate_marker_paths: list[tuple[str, str]] = []
    monkeypatch.setattr(
        clg,
        "write_duplicate_marker",
        lambda output_dir, existing_job_id: duplicate_marker_paths.append(
            (output_dir, existing_job_id),
        ),
    )

    should_process = clg.check_should_process(
        "tt0133093",
        "color",
        "whole_frame",
        "average",
        force_reprocess=False,
        output_dir=str(tmp_path),
    )

    assert should_process is False
    assert duplicate_marker_paths == [(str(tmp_path), "existing-job")]

