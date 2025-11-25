'use client';

import { useState, useEffect } from 'react';
import FileUpload from './FileUpload';
import ConfigPanel from './ConfigPanel';
import BarcodeDisplay from './BarcodeDisplay';

interface JobStatus {
  job_id: string;
  slurm_job_id?: string;
  status: string;
  error?: string;
  timestamp?: string;
  config?: any;
}

interface BarcodeResult {
  barcode: number[][];
  shape: number[];
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  metadata: {
    sampled_rate: number;
    skip_over: number;
    total_frames: number;
    frames_per_column: number;
  };
}

interface BarcodeConfig {
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  frames_per_column: number;
}

export default function BarcodeGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<BarcodeConfig>({
    color_metric: 'Average',
    frame_type: 'whole_frame',
    barcode_type: 'color',
    sampled_rate: 1,
    skip_over: 0,
    total_frames: -1,
    frames_per_column: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [slurmJobId, setSlurmJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusCheckInterval, setStatusCheckInterval] = useState<NodeJS.Timeout | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5000';

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [statusCheckInterval]);

  // Poll job status
  const checkJobStatus = async (currentJobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/job-status/${currentJobId}`);
      const data: JobStatus = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check job status');
      }

      setJobStatus(data.status);
      setSlurmJobId(data.slurm_job_id || null);

      // If job completed, fetch results
      if (data.status === 'COMPLETED') {
        await fetchJobResult(currentJobId);
        // Stop polling
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
          setStatusCheckInterval(null);
        }
      } else if (data.status === 'FAILED') {
        setError(data.error || 'Job failed');
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
          setStatusCheckInterval(null);
        }
      }
    } catch (err) {
      console.error('Error checking job status:', err);
      // Don't stop polling on error, server might be temporarily unavailable
    }
  };

  // Fetch job result
  const fetchJobResult = async (currentJobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/job-result/${currentJobId}`);
      const data: BarcodeResult = await response.json();

      if (!response.ok) {
        throw new Error('Failed to fetch job result');
      }

      setResult(data);
      setJobStatus('COMPLETED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch result');
    }
  };

  // Submit job to SLURM
  const handleGenerate = async () => {
    if (!file) {
      setError('Please select a video file');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);
    setJobId(null);
    setSlurmJobId(null);
    setJobStatus(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('color_metric', config.color_metric);
    formData.append('frame_type', config.frame_type);
    formData.append('barcode_type', config.barcode_type);
    formData.append('sampled_rate', config.sampled_rate.toString());
    formData.append('skip_over', config.skip_over.toString());
    formData.append('total_frames', config.total_frames.toString());
    formData.append('frames_per_column', config.frames_per_column.toString());

    try {
      const response = await fetch(`${API_BASE}/api/submit-job`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }

      setJobId(data.job_id);
      setSlurmJobId(data.slurm_job_id);
      setJobStatus('PENDING');

      // Start polling for status (every 5 seconds)
      const interval = setInterval(() => {
        checkJobStatus(data.job_id);
      }, 5000);
      setStatusCheckInterval(interval);

      // Initial status check
      checkJobStatus(data.job_id);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel job
  const handleCancel = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`${API_BASE}/api/cancel-job/${jobId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel job');
      }

      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        setStatusCheckInterval(null);
      }

      setJobStatus('CANCELLED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  // Download PNG
  const handleDownloadPNG = () => {
    if (!jobId) return;
    window.open(`${API_BASE}/api/job-result/${jobId}/png`, '_blank');
  };

  // Download JSON
  const handleDownloadJSON = () => {
    if (!result) return;

    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'barcode.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusDisplay = () => {
    if (!jobStatus) return null;

    const statusColors: Record<string, string> = {
      PENDING: 'text-yellow-600',
      RUNNING: 'text-blue-600',
      COMPLETED: 'text-green-600',
      FAILED: 'text-red-600',
      CANCELLED: 'text-gray-600',
    };

    const statusMessages: Record<string, string> = {
      PENDING: 'Job submitted to queue, waiting for compute resources...',
      RUNNING: 'Processing video on compute node...',
      COMPLETED: 'Processing complete!',
      FAILED: 'Job failed',
      CANCELLED: 'Job cancelled',
    };

    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Job Status:</span>
            <span className={`font-bold ${statusColors[jobStatus] || 'text-gray-600'}`}>
              {jobStatus}
            </span>
          </div>
          {slurmJobId && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">SLURM Job ID:</span>
              <span className="font-mono">{slurmJobId}</span>
            </div>
          )}
          <p className="text-sm text-gray-600">{statusMessages[jobStatus] || jobStatus}</p>
          {(jobStatus === 'PENDING' || jobStatus === 'RUNNING') && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
              >
                Cancel Job
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold">KALMUS Movie Barcode Generator</h1>
        <p className="text-gray-600">
          Upload a video to generate color barcodes using the university&apos;s HPC cluster
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <FileUpload onFileSelect={setFile} selectedFile={file} />
          <ConfigPanel config={config} onConfigChange={setConfig} />
          
          <button
            onClick={handleGenerate}
            disabled={!file || isSubmitting || (jobStatus === 'PENDING' || jobStatus === 'RUNNING')}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSubmitting ? 'Submitting...' : 'Submit to Cluster'}
          </button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {getStatusDisplay()}
        </div>

        <div>
          {result && (
            <BarcodeDisplay
              barcode={result.barcode}
              onDownloadJSON={handleDownloadJSON}
              onDownloadPNG={handleDownloadPNG}
            />
          )}
        </div>
      </div>
    </div>
  );
}
