"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

export default function FileUpload({
  onFileSelect,
  selectedFile,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

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
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border border-dashed rounded p-10 text-center cursor-pointer
          transition-all duration-300 group
          ${isDragging 
            ? 'border-amber-500 bg-amber-500/10 shadow-[0_0_30px_rgba(212,165,116,0.2)]' 
            : 'border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5'
          }
        `}
      >
        {/* Decorative corners */}
        <div className={`absolute top-0 left-0 w-4 h-4 border-t border-l transition-colors duration-300 ${isDragging ? 'border-amber-500' : 'border-amber-500/40'}`} />
        <div className={`absolute top-0 right-0 w-4 h-4 border-t border-r transition-colors duration-300 ${isDragging ? 'border-amber-500' : 'border-amber-500/40'}`} />
        <div className={`absolute bottom-0 left-0 w-4 h-4 border-b border-l transition-colors duration-300 ${isDragging ? 'border-amber-500' : 'border-amber-500/40'}`} />
        <div className={`absolute bottom-0 right-0 w-4 h-4 border-b border-r transition-colors duration-300 ${isDragging ? 'border-amber-500' : 'border-amber-500/40'}`} />

        <input
          type="file"
          id="video-upload"
          accept="video/*,.mp4,.avi,.mov,.mkv,.flv,.wmv"
          onChange={handleFileInput}
          className="hidden"
        />
        <label htmlFor="video-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all duration-300 ${isDragging ? 'border-amber-500 bg-amber-500/20' : 'border-amber-500/30 group-hover:border-amber-500/50'}`}>
              <svg
                className={`w-8 h-8 transition-colors duration-300 ${isDragging ? 'text-amber-500' : 'text-amber-500/50 group-hover:text-amber-500/70'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-mono text-amber-100/80 tracking-wider mb-1">
                {isDragging ? 'DROP_FILE_HERE' : 'DROP_VIDEO_OR_BROWSE'}
              </p>
              <p className="text-xs text-amber-500/50 font-mono">
                // MP4, AVI, MOV, MKV, FLV, WMV
              </p>
            </div>
          </div>
        </label>
      </div>

      {selectedFile && (
        <div className="mt-4 p-4 bg-black/40 border border-amber-500/20 rounded relative overflow-hidden">
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-500/50" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-500/50" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-500/50" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-500/50" />
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-cyan-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-mono text-amber-100/90">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-amber-500/50 font-mono">
                  SIZE: {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={() => onFileSelect(null as any)}
              className="p-2 text-amber-500/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-200"
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
