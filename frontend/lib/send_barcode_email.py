#!/usr/bin/env python3
"""
Send KALMUS job notification email.
"""

import argparse
import json
import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


def load_from_metadata(metadata_file: str) -> dict:
    """Returns {"job_id": ..., "config": ..., "movie": ...}; empty dict on error."""
    try:
        with open(metadata_file, "r") as f:
            metadata = json.load(f)
        movie = metadata.get("movie")
        if not isinstance(movie, dict):
            movie = None
        elif not any([movie.get("year"), movie.get("genre"), movie.get("director")]):
            movie = None
        config = metadata.get("config")
        if not isinstance(config, dict):
            config = None
        return {
            "job_id": metadata.get("jobId"),
            "config": config,
            "movie": movie,
        }
    except Exception:
        return {}


def _label_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:2px 12px 2px 0; font-family:\'Courier New\', Courier, monospace; '
        f'font-size:11px; color:#9a9a9a; white-space:nowrap; vertical-align:top;">{label}</td>'
        f'<td style="padding:2px 0; font-family:\'Courier New\', Courier, monospace; '
        f'font-size:11px; color:#c8c8c8; vertical-align:top;">{value}</td>'
        f'</tr>'
    )


def build_job_details_html(job_id: Optional[str], config: Optional[dict]) -> str:
    rows = []
    if job_id:
        rows.append(_label_row("Job ID", job_id))
    if config:
        if config.get("barcode_type"):
            rows.append(_label_row("Barcode", config["barcode_type"]))
        if config.get("frame_type"):
            frame = config["frame_type"].replace("_", " ").title()
            rows.append(_label_row("Frame Type", frame))
        if config.get("color_metric"):
            metric = config["color_metric"].replace("_", " ").title()
            rows.append(_label_row("Color Metric", metric))
        if config.get("sampled_rate") is not None:
            rows.append(_label_row("Sampled Rate", str(config["sampled_rate"])))
    if not rows:
        return ""
    rows_html = "\n".join(rows)
    return f"""
            <tr>
              <td style="padding:0 24px 20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; background:rgba(100,100,100,0.06); border:1px solid rgba(100,100,100,0.2);">
                  <tr>
                    <td style="padding:14px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        {rows_html}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>"""


def build_film_card_html(movie: dict) -> str:
    title = movie.get("title") or ""
    year = movie.get("year") or ""
    genre = movie.get("genre") or ""
    director = movie.get("director") or ""
    poster_url = movie.get("poster_url") or ""

    meta_lines = []
    if year:
        meta_lines.append(f'<div style="font-size:13px; color:#e0e0e0; font-weight:600; margin:0 0 6px 0;">{title} ({year})</div>')
    else:
        meta_lines.append(f'<div style="font-size:13px; color:#e0e0e0; font-weight:600; margin:0 0 6px 0;">{title}</div>')
    if genre:
        meta_lines.append(f'<div style="font-family:\'Courier New\', Courier, monospace; font-size:11px; color:#9a9a9a; margin:0 0 4px 0;">{genre}</div>')
    if director:
        meta_lines.append(f'<div style="font-family:\'Courier New\', Courier, monospace; font-size:11px; color:#9a9a9a; margin:0;">Dir. {director}</div>')

    meta_html = "\n".join(meta_lines)

    if poster_url:
        return f"""
            <tr>
              <td style="padding:0 24px 20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; background:rgba(100,100,100,0.06); border:1px solid rgba(100,100,100,0.2);">
                  <tr>
                    <td style="padding:14px; width:80px; vertical-align:top;">
                      <img src="{poster_url}" alt="{title}" width="70" style="display:block; width:70px; height:auto; border:1px solid rgba(100,100,100,0.3);" />
                    </td>
                    <td style="padding:14px 14px 14px 0; vertical-align:top;">
                      {meta_html}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>"""
    else:
        return f"""
            <tr>
              <td style="padding:0 24px 20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; background:rgba(100,100,100,0.06); border:1px solid rgba(100,100,100,0.2);">
                  <tr>
                    <td style="padding:14px; vertical-align:top;">
                      {meta_html}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>"""


def build_subject(status: str, video_title: str, job_id: Optional[str] = None) -> str:
    suffix = f" [{job_id[:8]}]" if job_id else ""
    if status == "FAILED":
        return f"KALMUS Job Failed - {video_title}{suffix}"
    if status == "DUPLICATE":
        return f"KALMUS Existing Result - {video_title}{suffix}"
    return f"KALMUS Job Completed - {video_title}{suffix}"


def build_message_body(
    status: str,
    video_title: str,
    results_url: str,
    job_id: Optional[str] = None,
    config: Optional[dict] = None,
    movie: Optional[dict] = None,
) -> str:
    if status == "FAILED":
        headline = "Your KALMUS job failed."
        description = "Use the link below to review the job result page and any available error details."
    elif status == "DUPLICATE":
        headline = "A matching KALMUS analysis already exists."
        description = "We linked you to the existing result page instead of generating a duplicate run."
    else:
        headline = "Your KALMUS job completed successfully."
        description = "Use the link below to view the result page."

    status_color = "#9a9a9a" if status == "COMPLETED" else "#8a8a8a"

    job_details = build_job_details_html(job_id, config)
    film_card = build_film_card_html(movie) if movie else ""

    return f"""\
<html>
  <body style="margin:0; padding:0; background:#111111; color:#e0e0e0; font-family:Arial, Helvetica, sans-serif; line-height:1.6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111111; margin:0; padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; border-collapse:collapse; background:#1e1e1e; border:1px solid rgba(100,100,100,0.3); border-left:3px solid #5a5a5a;">
            <tr>
              <td style="padding:24px 24px 14px 24px; border-bottom:1px solid rgba(100,100,100,0.3);">
                <div style="font-family:'Courier New', Courier, monospace; font-size:11px; letter-spacing:0.28em; text-transform:uppercase; color:#9a9a9a; margin:0 0 10px 0;">KALMUS</div>
                <div style="font-size:22px; font-weight:600; color:#e0e0e0; margin:0;">Job Update</div>
                <div style="font-family:'Courier New', Courier, monospace; font-size:12px; color:#9a9a9a; margin:6px 0 0 0;">{video_title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 16px 24px;">
                <div style="margin:0 0 16px 0; color:#e0e0e0; font-size:14px;">{headline}</div>
                <div style="margin:0; color:#e0e0e0; font-size:14px;">{description}</div>
              </td>
            </tr>{job_details}{film_card}
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; background:rgba(100,100,100,0.08); border:1px solid rgba(100,100,100,0.3);">
                  <tr>
                    <td style="padding:16px;">
                      <div style="font-family:'Courier New', Courier, monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#9a9a9a; margin:0 0 12px 0;">Result page</div>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="background:#5a5a5a; padding:0;">
                            <a href="{results_url}" style="display:inline-block; padding:12px 18px; color:#ffffff; text-decoration:none; font-family:'Courier New', Courier, monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase;">Open Result Page</a>
                          </td>
                        </tr>
                      </table>
                      <div style="margin-top:16px; font-family:'Courier New', Courier, monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:{status_color};">Status: {status}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px; color:#7f7f7f; font-family:'Courier New', Courier, monospace; font-size:10px; letter-spacing:0.08em;">
                KALMUS barcode generation notification
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_email(
    to_email: str,
    status: str,
    results_url: str,
    video_title: str,
    job_id: Optional[str] = None,
    config: Optional[dict] = None,
    movie: Optional[dict] = None,
) -> bool:
    from_email = "noreply@bucknell.edu"
    subject = build_subject(status, video_title, job_id)
    html_body = build_message_body(status, video_title, results_url, job_id, config, movie)

    msg = MIMEMultipart("alternative")
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("localhost") as server:
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Send KALMUS job notification email")
    parser.add_argument("--email", required=True, help="Recipient email")
    parser.add_argument("--status", required=True, choices=["COMPLETED", "FAILED", "DUPLICATE"], help="Job status")
    parser.add_argument("--results-url", required=True, help="Link to the result page")
    parser.add_argument("--video-title", required=True, help="User-entered video title")
    parser.add_argument("--metadata-file", help="Path to job metadata.json for job details and film info")

    args = parser.parse_args()

    job_id = None
    config = None
    movie = None
    if args.metadata_file:
        data = load_from_metadata(args.metadata_file)
        job_id = data.get("job_id")
        config = data.get("config")
        movie = data.get("movie")

    success = send_email(args.email, args.status, args.results_url, args.video_title, job_id, config, movie)

    if success:
        print(f"Notification email sent successfully to {args.email}")
        sys.exit(0)
    else:
        print(f"Failed to send email to {args.email}")
        sys.exit(1)


if __name__ == "__main__":
    main()
