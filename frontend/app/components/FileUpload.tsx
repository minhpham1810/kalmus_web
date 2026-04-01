"use client";

import { useCallback } from "react";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
}

export default function FileUpload({
  onFileSelect,
  selectedFile,
}: FileUploadProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="relative p-10 text-center cursor-pointer transition-all group"
        style={{
          border: '1px solid var(--accent-crimson)',
          borderStyle: 'dashed',
        }}
      >
        {/* Corner brackets */}
        <span aria-hidden className="absolute top-2 left-2 font-mono text-[10px] leading-none" style={{ color: 'var(--accent-amber)', opacity: 0.7 }}>⌐</span>
        <span aria-hidden className="absolute top-2 right-2 font-mono text-[10px] leading-none" style={{ color: 'var(--accent-amber)', opacity: 0.7 }}>¬</span>
        <span aria-hidden className="absolute bottom-2 left-2 font-mono text-[10px] leading-none" style={{ color: 'var(--accent-amber)', opacity: 0.7 }}>L</span>
        <span aria-hidden className="absolute bottom-2 right-2 font-mono text-[10px] leading-none" style={{ color: 'var(--accent-amber)', opacity: 0.7 }}>J</span>

        <input
          type="file"
          id="video-upload"
          accept="video/*,.mp4,.avi,.mov,.mkv,.flv,.wmv"
          onChange={handleFileInput}
          className="hidden"
        />
        <label htmlFor="video-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-3">
            {/* Film reel SVG */}
            <svg
              className="w-10 h-10"
              style={{ color: 'var(--accent-crimson)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <div>
              <p className="font-mono text-xs tracking-[0.15em] uppercase kalmus-text-primary">
                Drop footage or click to load
              </p>
              <p className="font-mono text-[10px] kalmus-text-muted mt-1 tracking-wider">
                MP4 · AVI · MOV · MKV · FLV · WMV
              </p>
            </div>
          </div>
        </label>
      </div>

      {selectedFile && (
        <div className="kalmus-surface mt-3 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4 flex-shrink-0"
                style={{ color: 'var(--accent-amber)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <div>
                <p className="font-mono text-xs kalmus-text-primary">
                  {selectedFile.name}
                </p>
                <p className="font-mono text-[10px] kalmus-text-secondary">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={() => onFileSelect(null)}
              className="transition-colors"
              style={{ color: 'var(--accent-crimson)' }}
              title="Remove file"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
