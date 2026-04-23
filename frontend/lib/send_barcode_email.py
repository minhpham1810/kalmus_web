#!/usr/bin/env python3
"""
Send KALMUS job notification email.
"""

import argparse
import os
import smtplib
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def build_subject(status: str, video_title: str) -> str:
    if status == "FAILED":
        return f"KALMUS Job Failed - {video_title}"
    if status == "DUPLICATE":
        return f"KALMUS Existing Result Available - {video_title}"
    return f"KALMUS Job Completed - {video_title}"


def build_message_body(status: str, video_title: str, results_url: str) -> str:
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
              <td style="padding:24px;">
                <div style="margin:0 0 16px 0; color:#e0e0e0; font-size:14px;">{headline}</div>
                <div style="margin:0 0 18px 0; color:#e0e0e0; font-size:14px;">{description}</div>

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


def send_email(to_email: str, status: str, results_url: str, video_title: str) -> bool:
    from_email = "noreply@bucknell.edu"
    subject = build_subject(status, video_title)
    html_body = build_message_body(status, video_title, results_url)

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

    args = parser.parse_args()

    success = send_email(args.email, args.status, args.results_url, args.video_title)

    if success:
        print(f"Notification email sent successfully to {args.email}")
        sys.exit(0)
    else:
        print(f"Failed to send email to {args.email}")
        sys.exit(1)


if __name__ == "__main__":
    main()
