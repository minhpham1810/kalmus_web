#!/usr/bin/env python3
"""
Send barcode results via email with image attachment
"""

import argparse
import sys
import json
import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from datetime import datetime


def send_email(to_email, job_id, results_dir, video_filename):
    """Send email with barcode attachments"""

    # Read summary
    summary_path = Path(results_dir) / 'summary.json'
    with open(summary_path) as f:
        summary = json.load(f)

    # Get website URL from environment variable
    website_url = os.getenv('WEBSITE_URL', 'http://localhost:3000')
    results_url = f"{website_url}/results/{job_id}"

    # Email configuration
    from_email = "noreply@bucknell.edu"
    subject = f"KALMUS Barcode Ready - {video_filename}"

    # Create message
    msg = MIMEMultipart('mixed')
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject

    # HTML body
    html_body = f"""
    <html>
      <head>
        <style>
          body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
          .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
          .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                     color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
          .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
          .stats {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }}
          .stat-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
          .stat-label {{ font-weight: bold; color: #6b7280; }}
          .stat-value {{ color: #111827; }}
          .success-icon {{ font-size: 48px; margin-bottom: 10px; }}
          .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }}
          .button {{ display: inline-block; padding: 12px 24px; background: #667eea;
                     color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }}
          .cta-box {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                      padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }}
          .cta-button {{ display: inline-block; padding: 14px 28px; background: white;
                         color: #667eea; text-decoration: none; border-radius: 6px;
                         font-weight: bold; font-size: 16px; }}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✓</div>
            <h1>Your Barcode is Ready!</h1>
            <p>Video: {video_filename}</p>
          </div>

          <div class="content">
            <p>Hello!</p>

            <p>Your KALMUS movie barcode has been successfully generated and is attached to this email.</p>

            <div class="cta-box">
              <h2 style="color: white; margin: 0 0 10px 0; font-size: 20px;">Analyze Your Barcode Online</h2>
              <p style="color: rgba(255,255,255,0.9); margin: 0 0 20px 0; font-size: 14px;">
                View interactive visualizations, color statistics, and advanced analytics
              </p>
              <a href="{results_url}" class="cta-button">
                View Analysis Dashboard →
              </a>
            </div>

            <div class="stats">
              <h3 style="margin-top: 0; color: #111827;">Processing Summary</h3>
              <div class="stat-row">
                <span class="stat-label">Total Frames:</span>
                <span class="stat-value">{summary['total_frames']:,}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Film Length:</span>
                <span class="stat-value">{summary['film_length_in_frames']:,} frames</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Barcode Shape:</span>
                <span class="stat-value">{summary['barcode_shape'][0]} x {summary['barcode_shape'][1]}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Color Metric:</span>
                <span class="stat-value">{summary['color_metric']}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Frame Type:</span>
                <span class="stat-value">{summary['frame_type'].replace('_', ' ')}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">Barcode Type:</span>
                <span class="stat-value">{summary['barcode_type']}</span>
              </div>
              <div class="stat-row" style="border-bottom: none;">
                <span class="stat-label">Job ID:</span>
                <span class="stat-value">{job_id[:8]}...</span>
              </div>
            </div>

            <h3>What's Included:</h3>
            <ul>
              <li><strong>barcode.png</strong> - Your barcode visualization (high resolution)</li>
              <li><strong>barcode.json</strong> - Raw barcode data for further analysis</li>
            </ul>

            <h3 style="margin-top: 25px;">Online Dashboard Features:</h3>
            <ul>
              <li>📊 <strong>Color Statistics</strong> - Average color, dominant colors, brightness metrics</li>
              <li>📈 <strong>Hue Distribution</strong> - Interactive histogram of color distribution</li>
              <li>🎨 <strong>3D Color Cube</strong> - Explore RGB color space (drag to rotate)</li>
              <li>⚖️ <strong>Compare Barcodes</strong> - Analyze similarities with other videos</li>
            </ul>

            <p style="margin-top: 30px; padding: 20px; background: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 4px;">
              <strong>💡 Tip:</strong> The online dashboard provides advanced visualizations beyond what's possible in static images.
              You can also download the data as CSV for custom analysis.
            </p>

            <div class="footer">
              <p>This is an automated message from the KALMUS Movie Barcode Generator.</p>
              <p>Powered by <a href="https://github.com/KALMUS-Color-Toolkit/KALMUS" style="color: #667eea;">KALMUS</a> |
                 Processed on Bucknell HPC Cluster</p>
              <p style="margin-top: 10px; color: #9ca3af;">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            </div>
          </div>
        </div>
      </body>
    </html>
    """

    msg.attach(MIMEText(html_body, 'html'))

    # Attach barcode image
    image_path = Path(results_dir) / 'barcode.png'
    if image_path.exists():
        with open(image_path, 'rb') as f:
            img = MIMEImage(f.read())
            img.add_header('Content-Disposition', 'attachment', filename='barcode.png')
            msg.attach(img)

    # Attach JSON data
    json_path = Path(results_dir) / 'barcode.json'
    if json_path.exists():
        with open(json_path, 'rb') as f:
            attachment = MIMEBase('application', 'json')
            attachment.set_payload(f.read())
            encoders.encode_base64(attachment)
            attachment.add_header('Content-Disposition', 'attachment', filename='barcode.json')
            msg.attach(attachment)

    # Send email using local sendmail
    try:
        with smtplib.SMTP('localhost') as server:
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Send barcode email')
    parser.add_argument('--email', required=True, help='Recipient email')
    parser.add_argument('--job-id', required=True, help='Job ID')
    parser.add_argument('--results-dir', required=True, help='Results directory')
    parser.add_argument('--video-filename', required=True, help='Original video filename')

    args = parser.parse_args()

    success = send_email(args.email, args.job_id, args.results_dir, args.video_filename)

    if success:
        print(f"Email sent successfully to {args.email}")
        sys.exit(0)
    else:
        print(f"Failed to send email to {args.email}")
        sys.exit(1)


if __name__ == '__main__':
    main()
